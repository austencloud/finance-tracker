// src/lib/services/ai/conversation/handlers/duplicateConfirmationHandler.ts
import { createStateAwareHandler } from './factories';
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import type { Transaction } from '$lib/types/types';

/**
 * Helper function to clear the duplicate confirmation state
 */
function clearDuplicateConfirmationState(): void {
	conversationStore._setInternalState({
		waitingForDuplicateConfirmation: false,
		pendingDuplicateTransactions: [],
		lastUserMessageText: '',
		lastExtractionBatchId: null
	});
}

/**
 * Handler for user responses to a duplicate transaction confirmation request.
 * Only runs when the system has detected potential duplicates and is waiting
 * for the user to confirm whether to add them anyway.
 */
export const duplicateConfirmationHandler = createStateAwareHandler(
	// State check function - Only run if we're waiting for duplicate confirmation
	(context) => {
		const internalState = get(conversationStore)._internal;
		return !!internalState.waitingForDuplicateConfirmation;
	},
	// Actual handler logic
	async (context) => {
		const { message } = context;
		const lowerMessage = message.toLowerCase().trim();
		const internalState = get(conversationStore)._internal;
		const pendingTransactions = internalState.pendingDuplicateTransactions || [];

		const isConfirmation = /^(yes|y|add them|add it|add again)$/i.test(lowerMessage);
		const isRejection = /^(no|n|cancel|don't add|do not add)$/i.test(lowerMessage);

		if (isConfirmation) {
			console.log('[DuplicateConfirmationHandler] User confirmed adding duplicates.');

			if (pendingTransactions.length > 0) {
				// Add the pending transactions to the store
				transactionStore.add(pendingTransactions);
				clearDuplicateConfirmationState();

				return {
					response: `Okay, I've added the duplicate transaction${
						pendingTransactions.length > 1 ? 's' : ''
					} again. What's next?`,
					transactions: pendingTransactions // Also return them in the result for middleware
				};
			} else {
				console.warn(
					'[DuplicateConfirmationHandler] Confirmation flag was set, but no pending transactions found.'
				);
				clearDuplicateConfirmationState();

				return {
					response:
						"Something went wrong, I didn't have the duplicates saved properly. Please try adding them again if needed."
				};
			}
		} else if (isRejection) {
			console.log('[DuplicateConfirmationHandler] User rejected adding duplicates.');
			clearDuplicateConfirmationState();

			return {
				response: "Okay, I won't add the duplicates. Let me know what else I can help with."
			};
		} else {
			console.log('[DuplicateConfirmationHandler] Unclear response, re-prompting.');

			return {
				response:
					"Sorry, I need a clear 'yes' or 'no'. Should I add the duplicate transaction(s) again?"
			};
		}
	}
);

// Legacy export for backward compatibility during migration
export async function handleDuplicateConfirmation(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return duplicateConfirmationHandler({
		message,
		explicitDirectionIntent
	});
}
