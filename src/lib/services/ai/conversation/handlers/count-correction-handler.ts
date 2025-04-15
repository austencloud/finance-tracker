// src/lib/services/ai/conversation/handlers/count-correction-handler.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types/transactionTypes';
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt } from '../../prompts';
import { applyExplicitDirection, parseJsonFromAiResponse } from '$lib/utils/helpers';
import { conversationStore } from '../conversationStore'; // Import main store instance
import { extractedTransactions, lastExtractionResult } from '../conversationDerivedStores'; // Import derived stores

/**
 * Handles user messages indicating the AI extracted the wrong number of transactions.
 * Example: "No, there were 5 transactions", "You missed one", "That should be 3 items".
 *
 * @param message The user's input message.
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
		'less than that'
	];
	const containsCountKeyword = countKeywords.some((keyword) => lowerMessage.includes(keyword));
	const containsNumber = /\d+/.test(lowerMessage); // Check if the message contains a number

	// Get the internal state
	const lastResult = get(lastExtractionResult);
	const hasContextForCorrection =
		lastResult &&
		typeof lastResult === 'object' &&
		'originalUserInput' in lastResult &&
		!!lastResult.originalUserInput;

	if (!containsCountKeyword || !containsNumber || !hasContextForCorrection) {
		// Not a clear count correction or no previous context to correct
		return { handled: false };
	}

	// --- FIX: Get the count of previously extracted transactions BEFORE clearing ---
	// Cast the result to the expected type to resolve the 'unknown' error
	const previousTransactionCount = (get(extractedTransactions) as Transaction[]).length;

	console.log('[CountCorrectionHandler] Detected potential count correction.');
	conversationStore._updateStatus('Re-evaluating extraction...', 30);

	// --- Attempt to re-extract with the correction hint ---
	try {
		// We need the original text the user provided for the last extraction
		const originalText = lastResult.originalUserInput as string;
		const correctionHint = message; // Use the user's full correction message as context

		// Clear the potentially incorrect last batch of transactions before re-extracting
		// This simple approach clears ALL transactions. More complex logic could target specific batches.
		console.log(
			'[CountCorrectionHandler] Clearing existing extracted transactions before re-extraction.'
		);
		// Use the store method to clear/update transactions
		conversationStore._updateExtractedTransactions([], originalText, 'correction-clear'); // Clear transactions but keep context

		// Construct a prompt for re-extraction
		const reExtractionPrompt = `
            The user provided the following text for transaction extraction:
            """
            ${originalText}
            """
            My previous attempt extracted ${previousTransactionCount} transactions.
            The user has provided the following correction regarding the count:
            """
            ${correctionHint}
            """
            Please re-analyze the original text carefully, paying close attention to the user's correction about the number of transactions. Extract the transactions again based on this new information. Ensure you capture the correct number of items. Format the output as a JSON array of Transaction objects.
            JSON Array:
        `;

		const today = new Date().toISOString().split('T')[0];
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) }, // Use the standard system prompt
			{ role: 'user', content: reExtractionPrompt }
		];

		const aiResponse = await deepseekChat(messages, { temperature: 0.3 }); // Lower temp for focused re-extraction
		// --- FIX: Corrected type to allow null ---
		const parsedTransactions: Transaction[] | null =
			parseJsonFromAiResponse<Transaction[]>(aiResponse);

		// --- FIX: Handle null case ---
		if (!parsedTransactions) {
			// Handle case where parsing failed
			console.warn(
				'[CountCorrectionHandler] Failed to parse JSON response from AI after correction attempt.'
			);
			if (aiResponse && aiResponse.trim().length > 0 && !aiResponse.trim().startsWith('{')) {
				// Let it fall through to normal handler if response wasn't JSON-like
				conversationStore._clearLastInputContext(); // Clear context as re-extraction failed
				return { handled: false };
			}
			throw new Error('AI did not return valid JSON after correction.');
		}

		if (parsedTransactions.length === 0) {
			console.log('[CountCorrectionHandler] AI returned empty array after correction attempt.');
			conversationStore._clearLastInputContext(); // Clear context as re-extraction yielded nothing
			throw new Error('AI did not return valid transactions after correction.');
		}

		// Apply explicit direction if provided *during the correction*
		// --- FIX: Use only explicitDirectionIntent ---
		const directionToApply = explicitDirectionIntent; // Removed || lastResult.appliedDirection
		let finalTransactions = applyExplicitDirection(parsedTransactions, directionToApply);

		// Replace the previous extraction result with the new one
		// Use the appropriate store method - _updateExtractedTransactions replaces all
		conversationStore._updateExtractedTransactions(
			finalTransactions,
			originalText,
			'correction-update'
		);

		const response = `Okay, I've re-analyzed the text based on your correction. I now have ${finalTransactions.length} transaction(s). Does this look correct?`;
		conversationStore._updateStatus('Extraction updated', 100);
		// Clear context after successful correction
		conversationStore._clearLastInputContext();
		return { handled: true, response: response };
	} catch (error) {
		console.error('[CountCorrectionHandler] Error during re-extraction:', error);
		conversationStore._updateStatus('Error during correction');
		// --- FIX: Corrected getFallbackResponse call ---
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		conversationStore._clearLastInputContext(); // Clear context on error too
		return { handled: true, response: errorMsg }; // Handled the attempt, but failed
	}
}
