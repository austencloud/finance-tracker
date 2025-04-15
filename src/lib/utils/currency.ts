// src/lib/utils/currency.ts
import type { Transaction } from '$lib/types/transactionTypes';

/**
 * Formats a number as currency
 * @param amount The amount to format
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number | string): string {
	const numAmount = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;
	if (isNaN(numAmount)) {
		return '$0.00'; // Or handle error appropriately
	}
	return numAmount.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

/**
 * Parses a currency string to a number
 * @param currencyStr The currency string to parse
 * @returns Parsed number
 */
export function parseCurrency(currencyStr: string | number): number {
	if (typeof currencyStr === 'number') return currencyStr;

	return parseFloat(currencyStr.toString().replace(/[$,]/g, '')) || 0;
}

/**
 * Group transactions by month
 * @param transactions Array of transactions
 * @returns Object with month keys and transaction arrays
 */
function groupTransactionsByMonth(transactions: Transaction[]): Record<string, Transaction[]> {
	const grouped: Record<string, Transaction[]> = {};

	transactions.forEach((transaction) => {
		try {
			let date: Date;

			// Try to parse various date formats
			if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(transaction.date)) {
				const [month, day, year] = transaction.date.split('/').map((num) => parseInt(num, 10));
				date = new Date(year, month - 1, day);
			} else if (
				/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i.test(
					transaction.date
				)
			) {
				date = new Date(transaction.date);
			} else {
				// Skip if we can't parse the date
				return;
			}

			// Skip invalid dates
			if (isNaN(date.getTime())) {
				return;
			}

			// Create month key in format YYYY-MM
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

			// Initialize the array if it doesn't exist
			if (!grouped[monthKey]) {
				grouped[monthKey] = [];
			}

			// Add the transaction to the array
			grouped[monthKey].push(transaction);
		} catch (error) {
			console.error('Error grouping transaction:', error);
		}
	});

	return grouped;
}

/**
 * Calculate monthly totals by category
 * @param transactions Array of transactions
 * @returns Object with monthly totals by category
 */
export function calculateMonthlyTotals(
	transactions: Transaction[]
): Record<string, Record<string, number>> {
	const groupedByMonth = groupTransactionsByMonth(transactions);
	const monthlyTotals: Record<string, Record<string, number>> = {};

	// Calculate totals for each month
	Object.entries(groupedByMonth).forEach(([month, monthTransactions]) => {
		const categoryTotals: Record<string, number> = {};

		// Calculate totals for each category
		monthTransactions.forEach((transaction) => {
			// Initialize the category if it doesn't exist
			if (!categoryTotals[transaction.category]) {
				categoryTotals[transaction.category] = 0;
			}

			// Add to the category total
			const amount = parseFloat(transaction.amount.toString().replace(/[$,]/g, '')) || 0;
			const adjustedAmount =
				transaction.category === 'Expenses' ? -Math.abs(amount) : Math.abs(amount);
			categoryTotals[transaction.category] += adjustedAmount;
		});

		// Store the category totals for this month
		monthlyTotals[month] = categoryTotals;
	});

	return monthlyTotals;
}
