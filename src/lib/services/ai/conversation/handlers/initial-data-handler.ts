// src/lib/services/ai/conversation/handlers/initial-data-handler.ts
import { conversationMessages, extractedTransactions } from '../conversationDerivedStores';
import { get } from 'svelte/store';

import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';
// Import necessary helpers
import {
	parseJsonFromAiResponse,
	textLooksLikeTransaction,
	applyExplicitDirection
} from '$lib/utils/helpers';
// Removed unused looksLikeBulkData import
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants'; // Import constant
import { conversationStore } from '../conversationStore';
import type { Transaction } from '$lib/stores/types';

// Define a basic type for chat messages if not already imported
interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	// Add other potential properties if they exist
}

/**
 * Handles the *first* message from the user that appears to contain transaction data,
 * especially if it's NOT long enough to be considered "bulk" data.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled. This handler manages its own state updates.
 */
export async function handleInitialData(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean }> {
	const history = get(conversationMessages) as ChatMessage[];
	const currentTransactions = get(extractedTransactions) as Transaction[];
	// NOTE: Ensure textLooksLikeTransaction is defined and exported from helpers
	const looksLikeTxn = textLooksLikeTransaction(message);

	// Conditions for this handler:
	// 1. It looks like transaction data.
	// 2. EITHER it's the very first user message OR no transactions have been extracted yet.
	// 3. It's NOT long enough to trigger the bulk handler.
	const isFirstMeaningfulInput =
		history.filter((m) => m.role === 'user').length <= 1 || currentTransactions.length === 0;
	const isShortEnough = message.length < BULK_DATA_THRESHOLD_LENGTH; // Use constant

	if (!looksLikeTxn || !isFirstMeaningfulInput || !isShortEnough) {
		return { handled: false };
	}

	console.log('[InitialDataHandler] Handling initial (non-bulk) transaction data.');
	conversationStore._updateStatus('Extracting initial transactions...', 30);

	try {
		const today = new Date().toISOString().split('T')[0];
		// NOTE: Ensure getExtractionPrompt accepts two arguments if needed by its definition
		const extractionPrompt = getExtractionPrompt(message, today); // Pass today string if required
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: extractionPrompt }
		];

		const aiResponse = await deepseekChat(messages, { temperature: 0.2 });
		// NOTE: Ensure parseJsonFromAiResponse is defined and exported from helpers
		let parsedTransactions: Transaction[] | null = parseJsonFromAiResponse(aiResponse);

		if (!parsedTransactions) {
			throw new Error('AI did not return valid JSON.');
		}

		// Handle empty extraction result
		if (parsedTransactions.length === 0) {
			console.log('[InitialDataHandler] AI returned empty array, likely no transactions found.');
			conversationStore._addMessage(
				'assistant',
				"I looked through the text but couldn't find any clear transactions to extract. Could you try phrasing it differently or providing more details?"
			);
			conversationStore._updateStatus('No transactions found', 100);
			conversationStore._setProcessing(false); // Reset processing state
			return { handled: true };
		}

		// Apply explicit direction if provided
		// NOTE: Ensure applyExplicitDirection is defined and exported from helpers
		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent);

		// Add transactions to the store
		// NOTE: Ensure _addTransactions method exists on conversationStore
		conversationStore._addTransactions(finalTransactions);
		// NOTE: Ensure _setLastExtractionResult method exists on conversationStore
		conversationStore._setLastExtractionResult(finalTransactions, message, explicitDirectionIntent); // Store context

		// Generate confirmation message
		const confirmationMsg = `Okay, I've extracted ${finalTransactions.length} transaction(s). Does this look right? You can ask me to correct details or add more transactions.`;
		conversationStore._addMessage('assistant', confirmationMsg);
		conversationStore._updateStatus('Initial extraction complete', 100);
		conversationStore._setProcessing(false); // Reset processing state

		return { handled: true };
	} catch (error) {
		console.error('[InitialDataHandler] Error during initial extraction:', error);
		// NOTE: Ensure getFallbackResponse signature matches usage (typically takes 0 or 1 arg)
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined); // Removed second argument
		conversationStore._addMessage('assistant', errorMsg);
		conversationStore._updateStatus('Error during extraction');
		conversationStore._setProcessing(false); // Reset processing state
		return { handled: true }; // Handled the attempt, but failed
	}
}
