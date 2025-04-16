// src/lib/services/ai/conversation/handlers/bulk-direction-handler.ts
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/AppStore'; // *** Import central appStore ***
// --- REMOVE old store imports ---
// import { extractedTransactions } from '../../conversation/conversationDerivedStores';

// --- Import necessary types and helpers ---
import type { Transaction } from '$lib/stores/types';
import { categorizeTransaction } from '$lib/services/categorizer'; // Keep if applyExplicitDirection uses it

// --- Locally Defined Constants (Keep or move to shared constants) ---
const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

// --- Locally Defined Helper Function (Keep or move to shared utils) ---
/**
 * Applies an explicit direction override (if provided) to a list of transactions.
 * Returns NEW transaction objects with updated direction and potentially category.
 * Does NOT modify the original array or objects.
 * @param transactions The list of transactions to potentially modify.
 * @param explicitDirection 'in', 'out', or null.
 * @returns A new array of transactions with modifications applied.
 */
function applyExplicitDirection(
	transactions: readonly Transaction[], // Accept readonly array
	explicitDirection: 'in' | 'out' | null
): Transaction[] {
	// Return a new mutable array
	if (!explicitDirection) {
		// Return a new array copy even if no changes are made
		return transactions.map((txn) => ({ ...txn }));
	}

	return transactions.map((txn) => {
		let updatedTxn = { ...txn }; // Create a copy to modify
		if (updatedTxn.direction !== explicitDirection) {
			updatedTxn.direction = explicitDirection;
			// Adjust category based on the NEW direction
			if (explicitDirection === 'out') {
				if (updatedTxn.category !== 'Expenses') {
					updatedTxn.category = 'Expenses';
				}
			} else if (explicitDirection === 'in') {
				if (updatedTxn.category === 'Expenses') {
					// Re-categorize or use a default non-expense category
					const potentialCategory = categorizeTransaction(updatedTxn.description, updatedTxn.type);
					updatedTxn.category =
						potentialCategory === 'Expenses' ? 'Other / Uncategorized' : potentialCategory;
				}
			}
		}
		return updatedTxn; // Return the (potentially) modified copy
	});
}

// --- Main Handler Function ---

/**
 * Handles messages that explicitly set the direction for *all* transactions
 * currently in the main appStore.
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

	// --- Read transactions from the central appStore ---
	const currentTransactions = get(appStore).transactions;

	if (!Array.isArray(currentTransactions) || currentTransactions.length === 0) {
		// No need to provide a response here, the service will handle it if no handler matches.
		// Let the normal response handler pick it up if needed.
		// Alternative: return { handled: true, response: "..." } if you want this handler to always reply
		return {
			handled: true, // Indicate we recognized the command but had nothing to do
			response: 'There are no transactions recorded yet to apply that direction to.'
		};
	}

	console.log(
		`[BulkDirectionHandler] Applying bulk direction: ${explicitDirection} to ${currentTransactions.length} transactions.`
	);
	// --- Update status using appStore action ---
	appStore.setConversationStatus('Updating all directions...', 50);

	// Apply the direction override to generate *new* transaction objects with changes
	const transactionsWithUpdatedDirection = applyExplicitDirection(
		currentTransactions,
		explicitDirection
	);

	// --- Update transactions one by one in the appStore ---
	// This ensures analysis re-runs and UI updates reactively if needed
	transactionsWithUpdatedDirection.forEach((updatedTxn) => {
		appStore.updateTransaction(updatedTxn); // Use the existing action for each transaction
	});

	// --- Update status using appStore action ---
	appStore.setConversationStatus('Directions updated', 100);

	// Generate the response message
	const response = `Okay, I've marked all ${transactionsWithUpdatedDirection.length} transactions as ${explicitDirection === 'in' ? 'income/deposits' : 'expenses/payments'}.`;

	// Clear the internal context related to the last user message, as this bulk action likely resolves it
	appStore._setConversationInternalState({
		lastUserMessageText: '',
		lastExtractionBatchId: null
		// Decide if you want to clear clarification state here too, or let it persist
		// waitingForDirectionClarification: false,
		// clarificationTxnIds: []
	});

	return { handled: true, response: response };
}
