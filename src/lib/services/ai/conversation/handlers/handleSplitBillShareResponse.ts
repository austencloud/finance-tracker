// src/lib/services/ai/conversation/handlers/handleSplitBillShareResponse.ts
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

// --- Import specific stores ---
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';

// --- Import Types ---
import type { Transaction } from '$lib/types/types'; // Adjust path if needed

// --- Import Helpers / Services ---
import { categorizeTransaction } from '$lib/services/categorizer'; // For assigning category
// import { resolveAndFormatDate } from '$lib/utils/date'; // Not needed here, date comes from context
import { formatCurrency, applyExplicitDirection } from '$lib/utils/helpers'; // Import helpers

/**
 * Handles the user's response after being asked for their share of a split bill.
 * It expects a numeric value representing the user's portion.
 * Reads context from conversationStore, adds transaction via transactionStore.
 *
 * @param message The user's input message (expected to contain the share amount).
 * @param explicitDirectionIntent Optional direction hint (usually null here).
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleSplitBillShareResponse(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	// --- Read internal state directly from conversationStore ---
	const state = get(conversationStore)._internal; // Corrected access

	// --- Guard Clause: Only run if we are waiting for this specific input ---
	if (!state.waitingForSplitBillShare || !state.splitBillContext) {
		return { handled: false }; // Let other handlers try
	}

	// --- Attempt to Parse Share Amount ---
	// Look for the first number (integer or decimal) in the message. Handles "$10", "10.50", "£10", etc.
	const shareMatch = message.match(/([\d]+(?:[.,]\d+)?)/);
	// Replace comma decimal separator with period if necessary, then parse
	const shareAmountStr = shareMatch ? shareMatch[1].replace(',', '.') : null;
	const shareAmount = shareAmountStr ? parseFloat(shareAmountStr) : NaN;

	// --- Process Valid Share Amount ---
	if (!isNaN(shareAmount) && shareAmount > 0) {
		const context = state.splitBillContext; // Retrieve the stored context

		// Construct the new transaction using the user's share and stored context
		const newTransaction: Transaction = {
			id: uuidv4(),
			batchId: `split-share-${uuidv4().substring(0, 8)}`, // Unique batch ID
			date: context.possibleDate, // Use date resolved/defaulted when context was stored
			// Use the description derived by the LLM (or default) from context
			description: `Share of ${context.description || 'Shared Item'}`,
			type: 'Split', // Assign a specific transaction type
			amount: shareAmount, // The user's share amount
			currency: context.currency, // The original currency of the split bill
			// Categorize based on the derived description
			category: categorizeTransaction(
				`Share of ${context.description || 'Shared Item'}`, // Use same description
				'Split'
			),
			notes: `User share of split bill. Original total approx ${context.totalAmount} ${context.currency}. Original context: "${context.originalMessage}"`,
			// Default direction to 'out' for split shares, as it's usually an expense
			direction: 'out',
			needs_clarification: null // Explicitly set clarification as null
		};

		// Allow explicit direction override if user somehow specified it (e.g., "my share was 10 IN")
		// Use the imported helper function
		const finalTransaction = applyExplicitDirection([newTransaction], explicitDirectionIntent)[0];

		// --- Add the transaction using transactionStore action ---
		transactionStore.add([finalTransaction]); // Correct action call
		// --- Clear the waiting state using conversationStore action ---
		conversationStore.clearSplitBillWaitState(); // Correct action call

		// Format the amount/currency for the confirmation message using helper
		const formattedAmount = formatCurrency(finalTransaction.amount, finalTransaction.currency);

		// Return success
		return {
			handled: true,
			response: `Okay, I've added your ${formattedAmount} share for "${finalTransaction.description}".`
		};
	} else if (message.toLowerCase().includes('cancel')) {
		// --- Handle Cancellation ---
		console.log('[SplitBillShareResponse] User cancelled split bill entry.');
		// --- Clear the state using conversationStore action ---
		conversationStore.clearSplitBillWaitState(); // Correct action call
		return { handled: true, response: "Okay, I've cancelled the split bill entry." };
	} else {
		// --- Handle Invalid Input (Not a number, not cancel) ---
		console.warn('[SplitBillShareResponse] Could not parse share amount from:', message);
		// Ask again, but don't clear the waiting state
		return {
			handled: true, // Still handled by this handler (re-prompting)
			response:
				"Sorry, I need just the numeric amount for your share (e.g., '10', '15.50'). How much did you personally pay, or say 'cancel'?"
		};
	}
}

// Ensure applyExplicitDirection and formatCurrency are correctly imported from '$lib/utils/helpers'
