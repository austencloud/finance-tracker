// src/lib/services/ai/conversation/handlers/direction-clarification-handler.ts
import { extractedTransactions } from '../conversationDerivedStores'; // Import main store and extractedTransactions
import { get } from 'svelte/store';
import { categorizeTransaction } from '$lib/services/categorizer';
import { conversationStore } from '../conversationStore';
import type { Transaction } from '$lib/stores/types';
import { applyExplicitDirection } from '$lib/utils/helpers';
import { appStore } from '$lib/stores';

// --- Main Handler Function ---

/**
 * Handles user responses when the AI has asked for clarification on transaction direction (in/out).
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and an optional response.
 * This handler will typically update the stored transactions based on the clarification
 * and provide a confirmation message.
 */
export async function handleDirectionClarification(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null // Keep signature consistent
): Promise<{ handled: boolean; response?: string }> {
	const internalState = conversationStore._getInternalState();
	const needsClarification = internalState.waitingForDirectionClarification;
	const txnIdsForClarification = internalState.clarificationTxnIds;

	if (!needsClarification) {
		return { handled: false };
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
		conversationStore._setClarificationNeeded(false, []);
		return {
			handled: true,
			response: "Okay, I've cancelled the clarification request. What's next?"
		};
	} else {
		// Ask again if unclear
		conversationStore._addMessage(
			'assistant',
			"Sorry, I didn't quite catch that. Are these generally 'in' (income) or 'out' (expenses)?"
		);
		return { handled: true }; // Handled by re-prompting
	}

	// --- Apply the clarified direction using appStore ---
	console.log(
		`[DirectionClarificationHandler] Applying clarified direction: ${clarifiedDirection}`
	);

	// Get the list of transactions *currently* in the main store
	const allCurrentTransactions = get(appStore).transactions;

	// Find the specific transactions needing update based on stored IDs
	const transactionsToUpdate = allCurrentTransactions.filter(
		(t: Transaction) => t.id && txnIdsForClarification.includes(t.id)
	);

	if (transactionsToUpdate.length > 0) {
		// Use the PURE helper function to get the modified transaction data
		// Note: This returns NEW objects, doesn't modify originals
		const updatedTransactionData = applyExplicitDirection(transactionsToUpdate, clarifiedDirection);

		// *** Update transactions one by one in the appStore ***
		updatedTransactionData.forEach((updatedTxn) => {
			appStore.updateTransaction(updatedTxn); // Use the store action
		});

		// Clear the clarification state in conversationStore
		conversationStore._setClarificationNeeded(false, []);
		// Clear context that led to clarification
		conversationStore._clearLastInputContext();

		const response = `Got it! I've updated ${updatedTransactionData.length} transaction(s) as ${clarifiedDirection === 'in' ? 'income/deposits' : 'expenses/payments'}.`;
		return { handled: true, response: response };
	} else {
		console.warn(
			'[DirectionClarificationHandler] Clarification received, but no transactions found matching the stored IDs in appStore.'
		);
		conversationStore._setClarificationNeeded(false, []);
		conversationStore._clearLastInputContext();
		return {
			handled: true,
			response:
				"Okay, thanks for clarifying. It seems the transactions I was asking about are no longer in the list. What's next?"
		};
	}
}
