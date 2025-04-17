// src/lib/services/ai/conversation/handlers/handleSplitBillShareResponse.ts
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/stores/types';
import { categorizeTransaction } from '$lib/services/categorizer'; // For assigning category
import { resolveAndFormatDate } from '$lib/utils/date'; // To use today's date if context date was unknown

export async function handleSplitBillShareResponse(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null // Keep signature consistent
): Promise<{ handled: boolean; response?: string }> {
	const state = get(appStore).conversation._internal;

	// Only run if we are waiting for this specific input
	if (!state.waitingForSplitBillShare || !state.splitBillContext) {
		return { handled: false };
	}

	// Try to extract the number share from the user's response
	// Look for the first number (integer or decimal) in the message
	const shareMatch = message.match(/([\d]+(?:[.,]\d+)?)/);
	const shareAmountStr = shareMatch ? shareMatch[1].replace(',', '.') : null; // Handle comma decimal sep
	const shareAmount = shareAmountStr ? parseFloat(shareAmountStr) : NaN;

	if (!isNaN(shareAmount) && shareAmount > 0) {
		// User provided a valid share amount
		const context = state.splitBillContext;

		// Construct the transaction
		const newTransaction: Transaction = {
			id: uuidv4(),
			batchId: `split-${uuidv4().substring(0, 8)}`, // Unique batch ID for this split
			date: context.possibleDate, // Use date resolved earlier, which defaults to today if needed
			description: `Share of ${context.description || 'Split Bill'}`, // Use context description
			type: 'Split', // Assign a specific type
			amount: shareAmount, // The user's share
			currency: context.currency, // The original currency
			// Assign category - maybe default to 'Expenses' or use context description?
			category: categorizeTransaction(`Share of ${context.description || 'Split Bill'}`, 'Split'),
			notes: `User share of a split bill. Original total approx ${context.totalAmount} <span class="math-inline">\{context\.currency\}\. Original context\: "</span>{context.originalMessage}"`,
			direction: 'out' // Usually splits are expenses, override if needed based on context/intent
		};

		// Apply explicit direction if provided (less common for split shares)
		const finalTransaction = applyExplicitDirection([newTransaction], explicitDirectionIntent)[0];

		appStore.addTransactions([finalTransaction]);
		appStore.clearSplitBillWaitState(); // Clear the waiting state

		// Format currency for response message
		const formattedAmount = formatCurrency(finalTransaction.amount, finalTransaction.currency);

		return {
			handled: true,
			response: `Okay, I've added your ${formattedAmount} share for the "${finalTransaction.description}".`
		};
	} else if (message.toLowerCase().includes('cancel')) {
		// Allow user to cancel
		appStore.clearSplitBillWaitState();
		return { handled: true, response: "Okay, I've cancelled the split bill entry." };
	} else {
		// User reply wasn't a clear number, ask again
		return {
			handled: true, // Still handled by this handler
			response:
				'Sorry, I need just the numeric amount for your share. How much did you personally pay?'
		};
	}
}

// Need helpers if used here (applyExplicitDirection, formatCurrency)
// These might be better placed in a shared utils file
function applyExplicitDirection(
	transactions: Transaction[],
	explicitDirection: 'in' | 'out' | null
): Transaction[] {
	if (!explicitDirection) return transactions;
	return transactions.map((txn) => ({ ...txn, direction: explicitDirection }));
}

// Basic formatter for the response message
function formatCurrency(amount: number, currencyCode: string): string {
	// Simplified version for confirmation message - adapt as needed
	return `${currencyCode} ${amount.toFixed(2)}`;
}
