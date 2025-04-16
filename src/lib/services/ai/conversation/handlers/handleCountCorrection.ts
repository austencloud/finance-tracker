// src/lib/services/ai/conversation/handlers/handleCountCorrection.ts
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/AppStore'; // *** Import central appStore ***

// --- Keep necessary imports ---
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt } from '../../prompts'; // Keep getSystemPrompt
// Import the updated parser function signature
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { applyExplicitDirection } from '$lib/utils/helpers'; // Keep helpers
import type { Transaction } from '$lib/stores/types';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for potentially adding IDs

/**
 * Handles user messages indicating the AI extracted the wrong number of transactions
 * from the *immediately preceding* user input text stored in conversation context.
 * Example: "No, there were 5 transactions", "You missed one", "That should be 3 items".
 *
 * @param message The user's input message (the correction hint).
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleCountCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();
	const countKeywords = [
		'missed',
		'only',
		'should be',
		'there were',
		'count is wrong',
		'more than that',
		'less than that',
		'wrong number'
	];
	const containsCountKeyword = countKeywords.some((keyword) => lowerMessage.includes(keyword));
	const containsNumber = /\d+/.test(lowerMessage);

	const conversationInternalState = get(appStore).conversation._internal;
	const originalText = conversationInternalState.lastUserMessageText;
	const lastBatchId = conversationInternalState.lastExtractionBatchId; // ID of the extraction being corrected

	const hasContextForCorrection = !!originalText && !!lastBatchId;

	if (!containsCountKeyword || !containsNumber || !hasContextForCorrection) {
		return { handled: false };
	}

	const currentMainTransactions = get(appStore).transactions;
	const previousBatchTransactions = currentMainTransactions.filter(
		(t) => t.batchId === lastBatchId // Assumes Transaction type has optional batchId
	);
	const previousTransactionCount = previousBatchTransactions.length;

	console.log(
		`[CountCorrectionHandler] Detected count correction for batch ${lastBatchId}. Original text present. Previous count (estimated): ${previousTransactionCount}`
	);
	appStore.setConversationStatus('Re-evaluating extraction...', 30);

	// --- Attempt to re-extract with the correction hint ---
	try {
		const correctionHint = message;

		const reExtractionPrompt = `
            The user previously provided the following text for transaction extraction:
            """
            ${originalText}
            """
            My previous attempt might have extracted an incorrect number of transactions (estimated ${previousTransactionCount} found).
            The user has now provided the following correction regarding the count:
            """
            ${correctionHint}
            """
            Please re-analyze the original text carefully, paying close attention to the user's correction about the number of transactions. Extract the transactions again based on this new information. Ensure you capture the correct number of items. Format the output as a JSON object containing a "transactions" array, where each element follows the Transaction schema (date, description, details, type, amount, direction).
            JSON Object:
        `;

		const today = new Date().toISOString().split('T')[0];
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: reExtractionPrompt }
		];

		const aiResponse = await deepseekChat(messages, { temperature: 0.2 });

		// --- Generate a NEW batchId for this correction attempt ---
		const newCorrectionBatchId = uuidv4();

		// --- Pass the new batchId to the parser ---
		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, newCorrectionBatchId); // <-- Added newCorrectionBatchId

		if (!Array.isArray(parsedTransactions)) {
			console.warn(
				'[CountCorrectionHandler] Failed to parse valid transaction array from AI after correction attempt.'
			);
			throw new Error('AI did not return valid JSON data after correction.');
		}

		if (parsedTransactions.length === 0) {
			console.log('[CountCorrectionHandler] AI returned empty array after correction attempt.');
			appStore._setConversationInternalState({
				lastUserMessageText: '',
				lastExtractionBatchId: null
			});
			throw new Error('AI did not find any transactions after correction.');
		}

		// Apply direction and ensure transactions have unique IDs and the NEW batch ID
		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent).map(
			(txn) => ({
				...txn,
				// id should already be assigned by parser's call to convertLLMDataToTransactions
				// batchId should also already be assigned by parser
				// If parser doesn't assign ID, add it here: id: uuidv4()
				// Ensure batchId is correctly set by parser (it should be if parser is updated)
				batchId: newCorrectionBatchId // Explicitly ensure it has the *new* ID
			})
		);

		// Add the *new* batch of transactions to the central store
		appStore.addTransactions(finalTransactions);

		const response = `Okay, I've re-analyzed the text based on your correction. I've added ${finalTransactions.length} transaction(s) based on that. Please check the list.`;
		appStore.setConversationStatus('Extraction updated', 100);
		// Clear context for the specific correction chain
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});
		return { handled: true, response: response };
	} catch (error) {
		console.error('[CountCorrectionHandler] Error during re-extraction:', error);
		appStore.setConversationStatus('Error during correction');
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});
		return { handled: true, response: errorMsg }; // Handled the attempt, but failed
	}
}
