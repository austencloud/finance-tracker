// src/lib/services/ai/conversation/handlers/handleDirectionClarification.ts

import { get } from 'svelte/store';
// --- Import specific stores ---
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
// --- Import Types ---
import type { Transaction } from '$lib/types/types'; // Adjust path if needed
// --- Import Helpers ---
import { applyExplicitDirection } from '$lib/utils/helpers'; // Adjust path if needed
// Removed categorizeTransaction import as applyExplicitDirection handles category adjustments internally

/**
 * Handles user responses when the AI has asked for clarification on transaction direction (in/out).
 * Reads clarification state from conversationStore and updates transactions in transactionStore.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint (ignored by this handler).
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleDirectionClarification(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null // Keep signature consistent, though not used here
): Promise<{ handled: boolean; response?: string }> {
	// --- Read internal state from conversationStore ---
	const conversationInternalState = get(conversationStore)._internal;
	const needsClarification = conversationInternalState.waitingForDirectionClarification;
	const txnIdsForClarification = conversationInternalState.clarificationTxnIds || [];

	// --- Guard Clause: Only run if waiting for this input ---
	if (!needsClarification) {
		return { handled: false };
	}

	const lowerMessage = message.toLowerCase().trim();
	let clarifiedDirection: 'in' | 'out' | null = null;

	// --- Determine Clarified Direction ---
	// Check for 'in' keywords, ensuring 'out' keywords aren't also present
	if (
		/\b(in|income|deposit|credit|received)\b/.test(lowerMessage) &&
		!/\b(out|expense|payment|spent|debit|charge)\b/.test(lowerMessage)
	) {
		clarifiedDirection = 'in';
	}
	// Check for 'out' keywords, ensuring 'in' keywords aren't also present
	else if (
		/\b(out|expense|payment|spent|debit|charge)\b/.test(lowerMessage) &&
		!/\b(in|income|deposit|credit|received)\b/.test(lowerMessage)
	) {
		clarifiedDirection = 'out';
	}
	// Check for cancellation
	else if (
		lowerMessage.includes('neither') ||
		lowerMessage.includes('cancel') ||
		lowerMessage.includes("don't know")
	) {
		console.log('[DirectionClarificationHandler] User cancelled clarification.');
		// --- Use conversationStore action to clear state ---
		conversationStore.setDirectionClarificationNeeded(false, []);
		// Optionally clear other context if needed
		conversationStore.clearCorrectionContext(); // Clears last message/batch context

		return {
			handled: true,
			response: "Okay, I've cancelled the clarification request. What's next?"
		};
	}
	// If input is ambiguous, ask again
	else {
		console.log('[DirectionClarificationHandler] Unclear response, re-prompting.');
		// --- Use conversationStore action to add message ---
		// Note: Returning only 'handled: true' without a response string means
		// finishProcessing in conversationService won't add an assistant message,
		// which might be desired if we want to avoid clutter.
		// Alternatively, return the re-prompt message here.
		return {
			handled: true,
			response:
				"Sorry, I didn't quite catch that. Are these generally 'in' (income/deposits) or 'out' (expenses/payments)?"
		};
	}

	// --- Apply the Clarified Direction ---
	console.log(
		`[DirectionClarificationHandler] Applying clarified direction: ${clarifiedDirection}`
	);

	// Get the list of transactions *currently* in the transactionStore
	const allCurrentTransactions = get(transactionStore);

	// Find the specific transactions needing update based on stored IDs
	const transactionsToUpdate = allCurrentTransactions.filter(
		(t: Transaction) => t.id && txnIdsForClarification.includes(t.id)
	);

	if (transactionsToUpdate.length > 0) {
		// Use the imported helper function to get the modified transaction data
		const updatedTransactionData = applyExplicitDirection(transactionsToUpdate, clarifiedDirection);

		// --- Update transactions one by one using transactionStore actions ---
		updatedTransactionData.forEach((updatedTxn) => {
			transactionStore.update(updatedTxn); // Use the correct store action
		});

		// --- Use conversationStore actions to clear state ---
		conversationStore.setDirectionClarificationNeeded(false, []);
		conversationStore.clearCorrectionContext(); // Clear related context

		const response = `Got it! I've updated ${updatedTransactionData.length} transaction(s) as ${clarifiedDirection === 'in' ? 'income/deposits' : 'expenses/payments'}.`;
		return { handled: true, response: response };
	} else {
		// This case might happen if transactions were deleted between asking and answering
		console.warn(
			'[DirectionClarificationHandler] Clarification received, but no transactions found matching the stored IDs.'
		);
		// --- Use conversationStore actions to clear state ---
		conversationStore.setDirectionClarificationNeeded(false, []);
		conversationStore.clearCorrectionContext();

		return {
			handled: true, // Still handled the clarification intent
			response:
				"Okay, thanks for clarifying. It seems the transactions I was asking about are no longer in the list. What's next?"
		};
	}
}
