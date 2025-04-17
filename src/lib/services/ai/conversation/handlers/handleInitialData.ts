// src/lib/services/ai/conversation/handlers/handleInitialData.ts

import { appStore } from '$lib/stores/AppStore';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import type { Transaction, ConversationMessage } from '$lib/stores/types';

import { llmChat, getLLMFallbackResponse } from '../../llm-helpers';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';
import { textLooksLikeTransaction, applyExplicitDirection } from '$lib/utils/helpers';
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants'; // Assuming this constant exists
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';

/**
 * Handles the *first* user message that looks like transaction data (and isn't bulk).
 * Attempts to extract transactions using the LLM.
 * Returns handled: true if it attempts processing, even on internal failure, to prevent fall-through.
 * Returns handled: false only if the initial conditions (first input, looks like txn, not bulk) are not met.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service ('in' or 'out').
 * @returns Promise resolving to an object { handled: boolean; response?: string }
 */
export async function handleInitialData(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	// Return signature includes optional response

	// --- Check initial conditions ---
	const history = get(appStore).conversation.messages as ConversationMessage[];
	const currentMainTransactions = get(appStore).transactions;
	const looksLikeTxn = textLooksLikeTransaction(message);
	const userHistoryCount = history.filter((m) => m.role === 'user').length; // Calculate user message count
	const isFirstMeaningfulInput = userHistoryCount <= 1 || currentMainTransactions.length === 0;
	const isShortEnough = message.length < BULK_DATA_THRESHOLD_LENGTH;

	// --- ADD DEBUG LOGGING ---
	console.log('[InitialDataHandler] Checking conditions:', {
		message: message.substring(0, 50) + (message.length > 50 ? '...' : ''), // Log truncated message
		looksLikeTxn,
		userHistoryCount, // Log the count
		transactionCount: currentMainTransactions.length, // Log txn count
		isFirstMeaningfulInput, // Log the combined condition result
		isShortEnough
	});
	// --- END DEBUG LOGGING ---

	// If conditions aren't met, this handler doesn't handle it
	if (!looksLikeTxn || !isFirstMeaningfulInput || !isShortEnough) {
		// --- ADD DEBUG LOGGING for early exit ---
		console.log('[InitialDataHandler] Conditions NOT met, returning handled: false.');
		// --- END DEBUG LOGGING ---
		return { handled: false }; // Let other handlers (like handleExtraction) try
	}
	// --- End Conditions Check ---

	// If conditions *are* met, this handler WILL handle the attempt
	console.log('[InitialDataHandler] Conditions met. Handling initial (non-bulk) transaction data.');
	// Set status early, even though parsing might fail later
	appStore.setConversationStatus('Extracting initial transactions...', 30);

	// Generate a unique ID for this batch attempt
	const newBatchId = uuidv4();
	console.log(`[InitialDataHandler] Generated batchId: ${newBatchId}`);

	try {
		const today = new Date().toISOString().split('T')[0];
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: extractionPrompt }
		];

		const aiResponse = await llmChat(messages, { temperature: 0.2, rawUserText: message });

		// Attempt to parse the response, passing the batch ID
		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, newBatchId);

		// --- Handle Parsing Failure ---
		// Check if the parser returned null/undefined or not an array
		if (!Array.isArray(parsedTransactions)) {
			console.warn(
				'[InitialDataHandler] Failed to parse valid transaction array from AI response.'
			);
			// Check if the raw AI response was likely just conversational text
			if (
				aiResponse &&
				typeof aiResponse === 'string' &&
				!aiResponse.trim().startsWith('{') &&
				!aiResponse.trim().startsWith('[')
			) {
				console.log(
					'[InitialDataHandler] AI response was text, providing conversational fallback.'
				);
				// Return handled: true, but with a generic failure message.
				// This PREVENTS fall-through to handleNormalResponse.
				appStore.clearCorrectionContext(); // Clear context as parsing failed
				appStore.setConversationStatus('Parsing failed', 100);
				return {
					handled: true, // We handled the attempt, even though it failed
					response:
						'Sorry, I had trouble understanding the transaction details in that format. Could you try phrasing it differently or perhaps using a list format?'
				};
			}
			// If it looked like JSON but failed parsing internally within the parser function
			throw new Error('AI response could not be parsed into valid transaction data structure.');
		}
		// --- End Handle Parsing Failure ---

		// Handle empty extraction result (successful parse, but zero transactions)
		if (parsedTransactions.length === 0) {
			console.log('[InitialDataHandler] Parser returned empty array, no transactions found.');
			const responseMsg =
				"I looked through the text but couldn't find any clear transactions to extract. Could you try phrasing it differently or providing more details?";
			// Add message directly to conversation history
			appStore.addConversationMessage('assistant', responseMsg);
			appStore.setConversationStatus('No transactions found', 100);
			// Still set context - user might want to correct the *parsing attempt* itself
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: newBatchId
			});
			// Return handled: true, no response string needed for finishProcessing
			return { handled: true };
		}

		// --- Process successfully parsed transactions ---
		// Apply explicit direction if provided, ensure IDs exist
		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent).map(
			(txn) => ({
				...txn, // Includes batchId from parser
				id: txn.id || uuidv4() // Ensure transaction ID exists
			})
		);

		console.log('[InitialDataHandler] Adding transactions:', JSON.stringify(finalTransactions));
		// Add the valid transactions to the main store state
		appStore.addTransactions(finalTransactions);
		const confirmationMsg =
			`Okay, I've extracted ${finalTransactions.length} transaction(s) and added them to the list. ` +
			`You can review them now or ask me to make corrections.`;
		appStore.setConversationStatus('Initial extraction complete', 100);
		// Generate confirmation message and add directly
		appStore.addConversationMessage('assistant', confirmationMsg);

		// Set context for potential corrections
		appStore._setConversationInternalState({
			lastUserMessageText: message, // The user message that was just processed
			lastExtractionBatchId: newBatchId // The ID of the batch just added
		});

		// Return handled: true, no response string needed for finishProcessing
		return { handled: true };
	} catch (error) {
		// Catch any errors from LLM call or other processing
		console.error('[InitialDataHandler] Error during initial extraction:', error);
		// Generate a user-friendly error message
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		// Set error status
		appStore.setConversationStatus('Error during extraction');
		// Clear correction context as the extraction failed
		appStore.clearCorrectionContext();
		// Return handled: true, providing the error message for finishProcessing to display
		return { handled: true, response: errorMsg };
	}
} // End handleInitialData
