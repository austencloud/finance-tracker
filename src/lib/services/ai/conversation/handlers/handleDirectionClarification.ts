// src/lib/services/ai/conversation/handlers/handleDirectionclarification.ts
// --- REMOVE old store imports ---
// import { extractedTransactions } from '../conversationDerivedStores';
// import { conversationStore } from '../conversationStore';

// --- Import central store and helpers ---
import { appStore } from '$lib/stores/AppStore'; // Import central store
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types/types';
import { applyExplicitDirection } from '$lib/utils/helpers';
// Removed categorizeTransaction import as applyExplicitDirection handles category adjustments internally

// --- Main Handler Function ---

/**
 * Handles user responses when the AI has asked for clarification on transaction direction (in/out).
 * Reads clarification state from appStore and updates transactions in appStore.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint (ignored by this handler).
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleDirectionClarification(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null // Keep signature consistent
): Promise<{ handled: boolean; response?: string }> {
	// --- Read internal state from appStore ---
	const conversationInternalState = get(appStore).conversation._internal;
	const needsClarification = conversationInternalState.waitingForDirectionClarification;
	const txnIdsForClarification = conversationInternalState.clarificationTxnIds || []; // Default to empty array

	if (!needsClarification) {
		return { handled: false }; // Not waiting for this type of input
	}

	const lowerMessage = message.toLowerCase().trim();
	let clarifiedDirection: 'in' | 'out' | null = null;

	// Determine clarified direction from user message
	if (
		/\b(in|income|deposit|credit)\b/.test(lowerMessage) &&
		!/\b(out|expense|payment|spent|debit)\b/.test(lowerMessage)
	) {
		clarifiedDirection = 'in';
	} else if (
		/\b(out|expense|payment|spent|debit)\b/.test(lowerMessage) &&
		!/\b(in|income|deposit|credit)\b/.test(lowerMessage)
	) {
		clarifiedDirection = 'out';
	} else if (lowerMessage.includes('neither') || lowerMessage.includes('cancel')) {
		// --- Use appStore action to clear clarification state ---
		appStore.setConversationClarificationNeeded(false, []);
		// Optionally clear context as well
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});
		return {
			handled: true,
			response: "Okay, I've cancelled the clarification request. What's next?"
		};
	} else {
		// Ask again if unclear
		// --- Use appStore action to add message ---
		appStore.addConversationMessage(
			'assistant',
			"Sorry, I didn't quite catch that. Are these generally 'in' (income) or 'out' (expenses)?"
		);
		// We handled it by re-prompting, but don't need to return a response string
		return { handled: true };
	}

	// --- Apply the clarified direction using appStore ---
	console.log(
		`[DirectionClarificationHandler] Applying clarified direction: ${clarifiedDirection}`
	);

	// Get the list of transactions *currently* in the main store
	const allCurrentTransactions = get(appStore).transactions;

	// Find the specific transactions needing update based on stored IDs
	// Ensure IDs are compared correctly (both should be strings)
	const transactionsToUpdate = allCurrentTransactions.filter(
		(t: Transaction) => t.id && txnIdsForClarification.includes(t.id)
	);

	if (transactionsToUpdate.length > 0) {
		// Use the PURE helper function to get the modified transaction data
		const updatedTransactionData = applyExplicitDirection(transactionsToUpdate, clarifiedDirection);

		// *** Update transactions one by one in the appStore (Already Correct) ***
		updatedTransactionData.forEach((updatedTxn) => {
			appStore.updateTransaction(updatedTxn); // Use the store action
		});

		// --- Use appStore action to clear clarification state ---
		appStore.setConversationClarificationNeeded(false, []);
		// --- Use appStore action to clear context ---
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});

		const response = `Got it! I've updated ${updatedTransactionData.length} transaction(s) as ${clarifiedDirection === 'in' ? 'income/deposits' : 'expenses/payments'}.`;
		return { handled: true, response: response };
	} else {
		console.warn(
			'[DirectionClarificationHandler] Clarification received, but no transactions found matching the stored IDs in appStore.'
		);
		// --- Use appStore action to clear clarification state ---
		appStore.setConversationClarificationNeeded(false, []);
		// --- Use appStore action to clear context ---
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});
		return {
			handled: true,
			response:
				"Okay, thanks for clarifying. It seems the transactions I was asking about are no longer in the list. What's next?"
		};
	}
}
