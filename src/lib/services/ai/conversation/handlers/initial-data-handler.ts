// src/lib/services/ai/conversation/handlers/initial-data-handler.ts
import { conversationMessages } from '../conversationDerivedStores'; // Read-only derived store
import { get } from 'svelte/store';
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';
import {
	parseJsonFromAiResponse,
	textLooksLikeTransaction,
	applyExplicitDirection
} from '$lib/utils/helpers';
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants';
import { conversationStore } from '../conversationStore'; // For updating state
import { appStore } from '$lib/stores/AppStore'; // For adding transactions
import type { Transaction } from '$lib/stores/types';

// Define a basic type for chat messages if not already imported elsewhere
interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number; // Optional timestamp
}

/**
 * Handles the *first* message from the user that appears to contain transaction data,
 * especially if it's NOT long enough to be considered "bulk" data.
 * Adds extracted transactions directly to the appStore.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled. This handler manages its own state updates and does not return a response string.
 */
export async function handleInitialData(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
	// *** CORRECTED RETURN TYPE ***
): Promise<{ handled: boolean; response?: string }> { // Now matches other handlers

	const history = get(conversationMessages) as ChatMessage[];
	// *** Check main transaction list length now ***
	const currentMainTransactions = get(appStore).transactions;

	const looksLikeTxn = textLooksLikeTransaction(message);

	// Conditions for this handler:
	// 1. It looks like transaction data.
	// 2. EITHER it's the very first user message OR no transactions exist in the main store yet.
	// 3. It's NOT long enough to trigger the bulk handler.
	const isFirstMeaningfulInput =
		history.filter((m) => m.role === 'user').length <= 1 || currentMainTransactions.length === 0;
	const isShortEnough = message.length < BULK_DATA_THRESHOLD_LENGTH;

	if (!looksLikeTxn || !isFirstMeaningfulInput || !isShortEnough) {
		return { handled: false }; // Let other handlers try
	}

	console.log('[InitialDataHandler] Handling initial (non-bulk) transaction data.');
	conversationStore._updateStatus('Extracting initial transactions...', 30);

	try {
		const today = new Date().toISOString().split('T')[0];
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: extractionPrompt }
		];

		const aiResponse = await deepseekChat(messages, { temperature: 0.2 });

		// --- PARSE AND VALIDATE RESPONSE (Similar to handleExtraction) ---
        let parsedData: unknown = parseJsonFromAiResponse(aiResponse);
        let parsedTransactions: Transaction[];

        if (parsedData && typeof parsedData === 'object' && 'transactions' in parsedData && Array.isArray(parsedData.transactions)) {
            parsedTransactions = parsedData.transactions as Transaction[];
        } else if (Array.isArray(parsedData)) {
            parsedTransactions = parsedData as Transaction[];
        } else {
            console.warn('[InitialDataHandler] Failed to parse a valid transaction array from AI response. Parsed data:', parsedData);
             if (aiResponse && typeof aiResponse === 'string' && !aiResponse.trim().startsWith('{') && !aiResponse.trim().startsWith('[')) {
                 console.log('[InitialDataHandler] AI response was text, letting normal handler try.');
                 // If it's text, maybe it's not initial data after all? Let other handlers try.
                 conversationStore._updateStatus(''); // Clear status
                 return { handled: false };
            }
            parsedTransactions = [];
        }
		// --- END PARSE AND VALIDATE ---


		// Handle empty extraction result
		if (parsedTransactions.length === 0) {
			console.log('[InitialDataHandler] AI returned empty array or failed parse, no transactions found.');
			// Add message directly via conversationStore helper
			conversationStore._addMessage(
				'assistant',
				"I looked through the text but couldn't find any clear transactions to extract. Could you try phrasing it differently or providing more details?"
			);
			conversationStore._updateStatus('No transactions found', 100);
            // Finish processing will be called by the main service, no need to set processing false here
			return { handled: true }; // Handled, but no response needed from service
		}

		// Apply explicit direction if provided
		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent);

		// *** Add transactions to the MAIN appStore ***
		appStore.addTransactions(finalTransactions);

		// Store context in conversationStore
		conversationStore._setLastExtractionResult(message); // Pass only message

		// Generate confirmation message and add directly
		const confirmationMsg = `Okay, I've extracted ${finalTransactions.length} transaction(s) and added them to the list. Does this look right? You can ask me to correct details or add more.`;
		conversationStore._addMessage('assistant', confirmationMsg);
		conversationStore._updateStatus('Initial extraction complete', 100);
        // Finish processing will be called by the main service

		return { handled: true }; // Handled, no response needed from service

	} catch (error) {
		console.error('[InitialDataHandler] Error during initial extraction:', error);
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		// Add error message directly
		conversationStore._addMessage('assistant', errorMsg);
		conversationStore._updateStatus('Error during extraction');
        // Finish processing will be called by the main service

		return { handled: true }; // Handled the attempt, but failed
	}
}
