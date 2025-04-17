// src/lib/stores/selectors.ts
import { get } from 'svelte/store';
import { transactionStore } from './transactionStore';
import { categories } from './categoryStore'; // Use readable category store
import { getAmountInBase } from '$lib/services/conversion'; // Import conversion helper
import type { Transaction, CategoryTotals, Category } from '../types/types'; // Adjust path

/**
 * Gets a transaction by its ID.
 * (Synchronous selector)
 */
export function getTransactionById(id: string | null): Transaction | null {
	if (!id) return null;
	const $transactions = get(transactionStore); // Get current value
	return $transactions.find((t) => t.id === id) ?? null;
}

/**
 * Calculates category totals, converting amounts to the base currency.
 * (Asynchronous selector)
 */
export async function getCategoryTotalsInBase(): Promise<CategoryTotals> {
	const $transactions = get(transactionStore); // Get current transactions
	const $categories = get(categories); // Get current categories
	const totals: CategoryTotals = {};
	let conversionErrors = 0;

	// Initialize totals for all known categories
	$categories.forEach((cat) => {
		totals[cat] = 0;
	});

	for (const txn of $transactions) {
		if (!txn.category || !totals.hasOwnProperty(txn.category)) continue;

		const amountInBase = await getAmountInBase(txn); // Use imported helper
		if (amountInBase === null) {
			conversionErrors++;
			continue;
		}

		const adjustedAmount =
			txn.direction === 'out' ? -Math.abs(amountInBase) : Math.abs(amountInBase);
		totals[txn.category] += adjustedAmount;
	}
	if (conversionErrors > 0) {
		console.warn(`[getCategoryTotals] Skipped ${conversionErrors} transactions...`);
	}
	return totals; // Values are in BASE_CURRENCY
}
