// src/lib/services/ai/conversation/handlers/bulk-direction-handler.ts
import { get } from 'svelte/store';
import { categorizeTransaction } from '$lib/services/categorizer';
import { extractedTransactions } from '../../conversation/conversationDerivedStores';
import { conversationStore } from '../conversationStore';
import type { Transaction } from '$lib/stores/types';

// --- Locally Defined Constants (Workaround for missing exports) ---
const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

// --- Locally Defined Helper Function (Workaround for missing export) ---
/**
 * Applies an explicit direction override (if provided) to a list of transactions.
 * Also adjusts category based on the new direction.
 * (Copied from conversationService and defined locally)
 * @param transactions The list of transactions to potentially modify.
 * @param explicitDirection 'in', 'out', or null.
 * @returns The modified list of transactions.
 */
function applyExplicitDirection(
	transactions: Transaction[],
	explicitDirection: 'in' | 'out' | null
): Transaction[] {
	if (!explicitDirection) {
		return transactions;
	}
	// console.log(`[applyExplicitDirection - local] Applying explicit direction override: ${explicitDirection}`);
	return transactions.map((txn) => {
		let updatedTxn = { ...txn };
		if (updatedTxn.direction !== explicitDirection) {
			updatedTxn.direction = explicitDirection;
			// Adjust category based on the NEW direction
			if (explicitDirection === 'out') {
				// If the category wasn't already 'Expenses', set it to 'Expenses'.
				if (updatedTxn.category !== 'Expenses') {
					updatedTxn.category = 'Expenses'; // Default expense category
				}
			} else if (explicitDirection === 'in') {
				// If the category was 'Expenses', try to re-categorize or use a default income category.
				if (updatedTxn.category === 'Expenses') {
					const potentialCategory = categorizeTransaction(updatedTxn.description, updatedTxn.type);
					// Use 'Other / Uncategorized' as fallback instead of 'Income' literal
					if (potentialCategory === 'Expenses') {
						updatedTxn.category = 'Other / Uncategorized';
					} else {
						updatedTxn.category = potentialCategory;
					}
				}
			}
		}
		return updatedTxn;
	});
}

// --- Main Handler Function ---

/**
 * Handles messages that explicitly set the direction for *all* currently extracted transactions.
 * Example: "These are all expenses", "Mark all as income".
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleBulkDirectionCorrection(
	message: string
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();
	let explicitDirection: 'in' | 'out' | null = null;

	// Use locally defined REGEX
	if (BULK_DIRECTION_ALL_IN_REGEX.test(lowerMessage)) {
		explicitDirection = 'in';
	} else if (BULK_DIRECTION_ALL_OUT_REGEX.test(lowerMessage)) {
		explicitDirection = 'out';
	}

	if (!explicitDirection) {
		return { handled: false }; // Not a bulk direction command
	}

	const currentTransactions = get(extractedTransactions);
	if (!Array.isArray(currentTransactions) || currentTransactions.length === 0) {
		return {
			handled: true,
			response: "I don't have any transactions recorded yet to apply that direction to."
		};
	}

	console.log(`[BulkDirectionHandler] Applying bulk direction: ${explicitDirection}`);
	conversationStore._updateStatus('Updating all directions...', 50);

	// Apply the direction override to all existing transactions
	// Use local applyExplicitDirection helper
	const updatedTransactions = applyExplicitDirection(currentTransactions, explicitDirection);

	// Replace the existing transactions with the updated ones using the store's update method
	conversationStore.update((state) => ({
		...state,
		extractedTransactions: updatedTransactions
		// Optionally clear last input context here if this global change invalidates it
		// _internal: { ...state._internal, lastUserMessageText: '', lastExtractionBatchId: null }
	}));

	conversationStore._updateStatus('Directions updated', 100);
	const response = `Okay, I've marked all ${updatedTransactions.length} transactions as ${explicitDirection === 'in' ? 'income/deposits' : 'expenses/payments'}.`;

	return { handled: true, response: response };
}
