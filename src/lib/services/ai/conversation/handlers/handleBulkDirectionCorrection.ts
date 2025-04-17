// src/lib/services/ai/conversation/handlers/handleBulkDirectionCorrection.ts
// Note: Filename might be handleBulkDirectionCorrection.ts based on previous steps

import { get } from 'svelte/store';
// --- Import specific stores ---
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
// --- Import Types ---
import type { Transaction } from '$lib/types/types'; // Adjust path if needed
// --- Import Helpers ---
import { applyExplicitDirection } from '$lib/utils/helpers'; // Import the helper

// --- Locally Defined Constants (or import from shared constants.ts) ---
const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

/**
 * Handles messages that explicitly set the direction for *all* transactions
 * currently in the main transactionStore.
 * Example: "These are all expenses", "Mark all as income".
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleBulkDirectionCorrection(
	message: string
	// explicitDirectionIntent is not needed as input for this specific handler
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();
	let explicitDirection: 'in' | 'out' | null = null;

	// Determine direction from regex
	if (BULK_DIRECTION_ALL_IN_REGEX.test(lowerMessage)) {
		explicitDirection = 'in';
	} else if (BULK_DIRECTION_ALL_OUT_REGEX.test(lowerMessage)) {
		explicitDirection = 'out';
	}

	// If neither regex matched, this handler doesn't apply
	if (!explicitDirection) {
		return { handled: false };
	}

	// --- Read transactions directly from transactionStore state ---
	const currentTransactions = get(transactionStore); // get() returns the array directly

	if (!Array.isArray(currentTransactions) || currentTransactions.length === 0) {
		// Respond that there's nothing to update
		return {
			handled: true,
			response: 'There are no transactions recorded yet to apply that direction to.'
		};
	}

	console.log(
		`[BulkDirectionHandler] Applying bulk direction: ${explicitDirection} to ${currentTransactions.length} transactions.`
	);
	// --- Update status using conversationStore action ---
	conversationStore.setStatus('Updating all directions...', 50);

	// Apply the direction override using the imported helper function
	const transactionsWithUpdatedDirection = applyExplicitDirection(
		currentTransactions,
		explicitDirection
	);

	// --- Update transactions using transactionStore actions ---
	// It's generally better to update them individually if store logic relies on it,
	// or create a batch update action if performance is critical for large lists.
	transactionsWithUpdatedDirection.forEach((updatedTxn) => {
		// Use the correct 'update' action from transactionStore
		transactionStore.update(updatedTxn);
	});

	// --- Update status using conversationStore action ---
	conversationStore.setStatus('Directions updated', 100);

	// Generate the response message
	const response = `Okay, I've marked all ${transactionsWithUpdatedDirection.length} transaction(s) as ${explicitDirection === 'in' ? 'income/deposits' : 'expenses/payments'}.`;

	// Clear related context in conversationStore
	conversationStore._setInternalState({
		lastUserMessageText: '', // Clear last message context
		lastExtractionBatchId: null,
		// Optionally clear clarification states if this action resolves them
		waitingForDirectionClarification: false,
		clarificationTxnIds: []
	});

	return { handled: true, response: response };
}
