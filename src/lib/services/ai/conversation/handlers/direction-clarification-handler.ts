// src/lib/services/ai/conversation/handlers/direction-clarification-handler.ts
import { extractedTransactions } from '../conversationDerivedStores'; // Import main store and extractedTransactions
import { get } from 'svelte/store';
import { categorizeTransaction } from '$lib/services/categorizer';
import { conversationStore } from '../conversationStore';
import type { Transaction } from '$lib/types/transactionTypes';

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
 * Handles user responses when the AI has asked for clarification on transaction direction (in/out).
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and an optional response.
 * This handler will typically update the stored transactions based on the clarification
 * and provide a confirmation message.
 */
export async function handleDirectionClarification(
	message: string
): Promise<{ handled: boolean; response?: string }> {
	// Get clarification state directly from the store's internal state
	const internalState = conversationStore._getInternalState();
	const needsClarification = internalState.waitingForDirectionClarification;
	const txnIdsForClarification = internalState.clarificationTxnIds;

	if (!needsClarification) {
		return { handled: false }; // Not waiting for this type of clarification
	}

	const lowerMessage = message.toLowerCase().trim();
	let clarifiedDirection: 'in' | 'out' | null = null;

	// Basic keyword matching for clarification
	if (
		lowerMessage.includes('in') ||
		lowerMessage.includes('income') ||
		lowerMessage.includes('deposit')
	) {
		clarifiedDirection = 'in';
	} else if (
		lowerMessage.includes('out') ||
		lowerMessage.includes('expense') ||
		lowerMessage.includes('payment') ||
		lowerMessage.includes('spent')
	) {
		clarifiedDirection = 'out';
	} else if (lowerMessage.includes('neither') || lowerMessage.includes('cancel')) {
		// User wants to cancel the pending clarification
		// Clear the clarification state using the available store method
		conversationStore._setClarificationNeeded(false, []);
		// No need to clear transactions, just the state flag/IDs
		return {
			handled: true,
			response: "Okay, I've cancelled the clarification request. What's next?" // Adjusted response
		};
	} else {
		// Could not determine direction from the response
		// Ask again or give up? For now, ask again.
		conversationStore._addMessage(
			'assistant',
			"Sorry, I didn't quite catch that. Are these transactions generally 'in' (income) or 'out' (expenses)?"
		);
		// We handled it by re-prompting.
		return { handled: true };
	}

	// --- Apply the clarified direction ---
	console.log(
		`[DirectionClarificationHandler] Applying clarified direction: ${clarifiedDirection}`
	);

	// Get all transactions and filter the ones needing clarification by ID
	const allTransactions = get(extractedTransactions) as Transaction[];
	const transactionsToUpdate = allTransactions.filter((t: Transaction) => {
		if (t.id) {
			return txnIdsForClarification.includes(t.id);
        }
        return false;
    });

	if (transactionsToUpdate.length > 0) {
		// Apply the direction using the local helper function
		const updatedTransactions = applyExplicitDirection(transactionsToUpdate, clarifiedDirection);

		// We need to update the *original* transactions in the main list,
		// not append duplicates. This requires a more complex update or a dedicated store method.
		// Workaround: Use _updateExtractedTransactions if it replaces based on ID,
		// or use the general update method to replace the whole list carefully.
		// Using general update for now:
		conversationStore.update((state) => {
			const updatedMap = new Map(updatedTransactions.map((t) => [t.id, t]));
			const finalTransactions = state.extractedTransactions.map((t) => updatedMap.get(t.id) || t);
			return {
				...state,
				extractedTransactions: finalTransactions
			};
		});

		// Clear the clarification state
		conversationStore._setClarificationNeeded(false, []);

		// Provide confirmation response
		const response = `Got it! I've updated ${updatedTransactions.length} transaction(s) as ${clarifiedDirection === 'in' ? 'income/deposits' : 'expenses/payments'}.`;
		return { handled: true, response: response };
	} else {
		console.warn(
			'[DirectionClarificationHandler] Clarification received, but no transactions found matching the stored IDs.'
		);
		// Clear state anyway
		conversationStore._setClarificationNeeded(false, []);
		return {
			handled: true,
			response:
				"Okay, thanks for clarifying. It seems the transactions I was asking about are gone now. Let me know what you'd like to do next."
		};
	}
}