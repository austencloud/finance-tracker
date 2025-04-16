// src/lib/services/ai/conversation/handlers/handleInitialData.ts

// --- Import central store and necessary types/helpers ---
import { appStore } from '$lib/stores/AppStore'; // For state access and actions
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid'; // For generating batch IDs
import type { Transaction, ConversationMessage } from '$lib/stores/types'; // Import types from central definitions

// --- Keep other necessary imports ---
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';
import {
	// parseJsonFromAiResponse, // Not used directly anymore
	textLooksLikeTransaction,
	applyExplicitDirection
} from '$lib/utils/helpers';
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants';
// Import the updated parser function signature
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';

export async function handleInitialData(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	// --- Read state from appStore ---
	const history = get(appStore).conversation.messages as ConversationMessage[];
	const currentMainTransactions = get(appStore).transactions;
	const looksLikeTxn = textLooksLikeTransaction(message);

	const isFirstMeaningfulInput =
		history.filter((m) => m.role === 'user').length <= 1 || currentMainTransactions.length === 0;
	const isShortEnough = message.length < BULK_DATA_THRESHOLD_LENGTH;

	if (!looksLikeTxn || !isFirstMeaningfulInput || !isShortEnough) {
		return { handled: false };
	}

	console.log('[InitialDataHandler] Handling initial (non-bulk) transaction data.');
	appStore.setConversationStatus('Extracting initial transactions...', 30);

	try {
		const today = new Date().toISOString().split('T')[0];
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: extractionPrompt }
		];

		const aiResponse = await deepseekChat(messages, { temperature: 0.2 });

		// --- Generate a NEW batchId for this extraction ---
		const newBatchId = uuidv4();

		// --- Pass the new batchId to the parser ---
		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, newBatchId); // <-- Added newBatchId

		if (!Array.isArray(parsedTransactions)) {
			// parseTransactionsFromLLMResponse already logs errors
			console.warn(
				'[InitialDataHandler] Failed to parse valid transaction array from AI response.'
			);
			if (
				aiResponse &&
				typeof aiResponse === 'string' &&
				!aiResponse.trim().startsWith('{') &&
				!aiResponse.trim().startsWith('[')
			) {
				console.log('[InitialDataHandler] AI response was text, letting normal handler try.');
				appStore.setConversationStatus(''); // Clear status
				return { handled: false }; // Let normal handler try
			}
			throw new Error('AI did not return valid transaction data.');
		}

		// Handle empty extraction result
		if (parsedTransactions.length === 0) {
			console.log('[InitialDataHandler] AI returned empty array, no transactions found.');
			appStore.addConversationMessage(
				'assistant',
				"I looked through the text but couldn't find any clear transactions to extract. Could you try phrasing it differently or providing more details?"
			);
			appStore.setConversationStatus('No transactions found', 100);
			return { handled: true };
		}

		// Apply direction and ensure transactions have unique IDs and the NEW batch ID
		// The parser should now assign the batchId, this map ensures it and adds unique txn ID
		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent).map(
			(txn) => ({
				...txn, // Spread the transaction from the parser (should include batchId)
				id: uuidv4() // Ensure each transaction has a unique ID (overwrite if parser already did?) -> Let's assume parser assigns ID too.
				// batchId: newBatchId // Redundant if parser assigns it, keep for clarity or remove
			})
		);

		console.log(
			'[InitialDataHandler] Attempting to add transactions to appStore:',
			JSON.stringify(finalTransactions)
		);

		// Add transactions to the MAIN appStore
		appStore.addTransactions(finalTransactions);

		// Use appStore action to store context (using the same batchId)
		appStore._setConversationInternalState({
			lastUserMessageText: message,
			lastExtractionBatchId: newBatchId // Store the ID of the batch just added
		});

		// Generate confirmation message and add directly via appStore action
		const confirmationMsg = `Okay, I've extracted ${finalTransactions.length} transaction(s) and added them to the list. You can review them now or ask me to make corrections.`;
		appStore.addConversationMessage('assistant', confirmationMsg);
		appStore.setConversationStatus('Initial extraction complete', 100);

		return { handled: true }; // Handled, no response needed from service
	} catch (error) {
		console.error('[InitialDataHandler] Error during initial extraction:', error);
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		appStore.addConversationMessage('assistant', errorMsg);
		appStore.setConversationStatus('Error during extraction');
		return { handled: true }; // Handled the attempt, but failed
	}
}
