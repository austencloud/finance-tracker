// src/lib/services/ai/conversation/handlers/bulkDirectionCorrectionHandler.ts
import { createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { applyExplicitDirection } from '$lib/utils/helpers';
import type { Transaction } from '$lib/types/types';
import type { HandlerContext } from './types';

// Constants for detection
const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

/**
 * Handler for messages that explicitly set the direction for ALL transactions
 * in the main transaction store. For example: "These are all expenses" or "Mark all as income".
 */
export const bulkDirectionCorrectionHandler = createConditionalHandler(
	{
		// Regex patterns to match bulk direction commands
		regex: [BULK_DIRECTION_ALL_IN_REGEX, BULK_DIRECTION_ALL_OUT_REGEX],
		// Only match short messages to avoid false positives
		customCheck: (message) => message.length < 50
	},
	async (context: HandlerContext) => {
		const { message } = context;
		const lowerMessage = message.toLowerCase().trim();

		// Determine which direction to apply
		let explicitDirection: 'in' | 'out' | null = null;
		if (BULK_DIRECTION_ALL_IN_REGEX.test(lowerMessage)) {
			explicitDirection = 'in';
		} else if (BULK_DIRECTION_ALL_OUT_REGEX.test(lowerMessage)) {
			explicitDirection = 'out';
		}

		// This should never happen due to the regex check, but as a safety measure
		if (!explicitDirection) {
			return {
				response: "I'm not sure if you want to mark these as income or expenses. Could you clarify?"
			};
		}

		// Get all transactions from the store
		const currentTransactions = get(transactionStore);

		// Check if there are any transactions to update
		if (!Array.isArray(currentTransactions) || currentTransactions.length === 0) {
			return {
				response: 'There are no transactions recorded yet to apply that direction to.'
			};
		}

		console.log(
			`[BulkDirectionHandler] Applying bulk direction: ${explicitDirection} to ${currentTransactions.length} transactions.`
		);

		conversationStore.setStatus('Updating all directions...', 50);

		// Apply the direction override to all transactions
		const transactionsWithUpdatedDirection = applyExplicitDirection(
			currentTransactions,
			explicitDirection
		);

		// Update each transaction in the store
		transactionsWithUpdatedDirection.forEach((updatedTxn) => {
			transactionStore.update(updatedTxn);
		});

		// Update status and clear context
		conversationStore.setStatus('Directions updated', 100);

		// Clear related contexts to avoid confusion in future user interactions
		conversationStore._setInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null,
			waitingForDirectionClarification: false,
			clarificationTxnIds: []
		});

		// Return success response
		return {
			response: `Okay, I've marked all ${transactionsWithUpdatedDirection.length} transaction(s) as ${
				explicitDirection === 'in' ? 'income/deposits' : 'expenses/payments'
			}.`
		};
	}
);

// Legacy export for backward compatibility during migration
export async function handleBulkDirectionCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return bulkDirectionCorrectionHandler({
		message,
		explicitDirectionIntent: null // Not needed for this handler
	});
}
