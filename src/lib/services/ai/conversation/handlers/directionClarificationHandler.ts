// src/lib/services/ai/conversation/handlers/directionClarificationHandler.ts
import { createStateAwareHandler } from './factories';
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { applyExplicitDirection } from '$lib/utils/helpers';
import type { Transaction } from '$lib/types/types';

/**
 * Handler for user responses to a direction clarification request.
 * Only runs when conversationStore indicates we're waiting for this clarification.
 */
export const directionClarificationHandler = createStateAwareHandler(
	// State check function - Only run if we're waiting for direction clarification
	(context) => {
		const internalState = get(conversationStore)._internal;
		return (
			internalState.waitingForDirectionClarification && internalState.clarificationTxnIds.length > 0
		);
	},
	// Actual handler logic
	async (context) => {
		const { message } = context;
		const lowerMessage = message.toLowerCase().trim();
		const internalState = get(conversationStore)._internal;
		const txnIdsForClarification = internalState.clarificationTxnIds || [];

		let clarifiedDirection: 'in' | 'out' | null = null;

		// Determine direction from message
		if (
			/\b(in|income|deposit|credit|received)\b/.test(lowerMessage) &&
			!/\b(out|expense|payment|spent|debit|charge)\b/.test(lowerMessage)
		) {
			clarifiedDirection = 'in';
		} else if (
			/\b(out|expense|payment|spent|debit|charge)\b/.test(lowerMessage) &&
			!/\b(in|income|deposit|credit|received)\b/.test(lowerMessage)
		) {
			clarifiedDirection = 'out';
		} else if (
			lowerMessage.includes('neither') ||
			lowerMessage.includes('cancel') ||
			lowerMessage.includes("don't know")
		) {
			// Handle cancellation
			console.log('[DirectionClarificationHandler] User cancelled clarification.');
			conversationStore.setDirectionClarificationNeeded(false, []);
			conversationStore.clearCorrectionContext();
			return { response: "Okay, I've cancelled the clarification request. What's next?" };
		} else {
			// Handle ambiguous input
			console.log('[DirectionClarificationHandler] Unclear response, re-prompting.');
			return {
				response:
					"Sorry, I didn't quite catch that. Are these generally 'in' (income/deposits) or 'out' (expenses/payments)?"
			};
		}

		console.log(
			`[DirectionClarificationHandler] Applying clarified direction: ${clarifiedDirection}`
		);

		// Get all transactions currently in store
		const allCurrentTransactions = get(transactionStore);

		// Find transactions needing update based on stored IDs
		const transactionsToUpdate = allCurrentTransactions.filter(
			(t: Transaction) => t.id && txnIdsForClarification.includes(t.id)
		);

		if (transactionsToUpdate.length > 0) {
			// Apply the direction to all matched transactions
			const updatedTransactions = applyExplicitDirection(transactionsToUpdate, clarifiedDirection);

			// Update each transaction in the store
			updatedTransactions.forEach((txn) => {
				transactionStore.update(txn);
			});

			// Clear state after successful update
			conversationStore.setDirectionClarificationNeeded(false, []);
			conversationStore.clearCorrectionContext();

			return {
				response: `Got it! I've updated ${updatedTransactions.length} transaction(s) as ${
					clarifiedDirection === 'in' ? 'income/deposits' : 'expenses/payments'
				}.`
			};
		} else {
			// Handle case where transactions were deleted since asking
			console.warn('[DirectionClarificationHandler] No transactions found matching stored IDs.');
			conversationStore.setDirectionClarificationNeeded(false, []);
			conversationStore.clearCorrectionContext();

			return {
				response:
					"Okay, thanks for clarifying. It seems the transactions I was asking about are no longer in the list. What's next?"
			};
		}
	}
);

// Legacy export for backward compatibility during migration
export async function handleDirectionClarification(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return directionClarificationHandler({
		message,
		explicitDirectionIntent
	});
}
