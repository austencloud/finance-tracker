// src/lib/services/ai/conversation/bulk/processing-helpers.ts
import type { Transaction } from '$lib/types';

/**
 * Deduplicates transactions based on date, amount, and normalized description.
 * @param transactions Array of Transaction objects.
 * @returns Array of unique Transaction objects.
 */
export function deduplicateTransactions(transactions: Transaction[]): Transaction[] {
	const seen = new Set<string>();
	return transactions.filter((txn) => {
		// Normalize description slightly for better matching
		const normalizedDescription = (txn.description || '').toLowerCase().replace(/\s+/g, ' ').trim();
		// Create a unique key
		const key = `${txn.date}-${txn.amount}-${normalizedDescription}`;
		if (seen.has(key)) {
			// console.log(`[deduplicate] Duplicate found: ${key}`);
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * Generates a markdown string summarizing transactions by category count and total amount.
 * @param transactions Array of Transaction objects.
 * @returns A formatted string summarizing the categories.
 */
export function getCategoryBreakdown(transactions: Transaction[]): string {
	const categories = new Map<string, { count: number; total: number }>();

	transactions.forEach((txn) => {
		const category = txn.category || 'Other / Uncategorized'; // Default category if missing
		if (!categories.has(category)) {
			categories.set(category, { count: 0, total: 0 });
		}

		// Ensure amount is a number
		const amount = typeof txn.amount === 'string'
			? parseFloat(txn.amount.replace(/[$,]/g, '')) || 0
			: txn.amount || 0;

		const entry = categories.get(category)!; // Assert non-null as we initialize above
		entry.count++;
		// Sum absolute amounts for breakdown, directionality handled elsewhere
		entry.total += Math.abs(amount);
	});

	if (categories.size === 0) {
		return 'No categories found.';
	}

	let breakdown = '**Transaction Summary:**\n';
	categories.forEach((data, category) => {
		breakdown += `- ${category}: ${data.count} transaction(s) totaling $${data.total.toFixed(2)}\n`;
	});

	return breakdown.trim();
}
