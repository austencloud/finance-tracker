// src/utils/helpers.ts
import type { Transaction } from '../types';

/**
 * Formats a number as currency
 * @param amount The amount to format
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number | string): string {
	// Ensure amount is a number
	const numAmount = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;

	// Return formatted currency
	return numAmount.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

/**
 * Formats a date string to a standard format
 * @param dateStr The date string to format
 * @returns Formatted date string
 */
export function formatDate(dateStr: string): string {
	// Handle different date formats
	let date: Date;

	// Try MM/DD/YYYY format
	if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
		const [month, day, year] = dateStr.split('/').map((num) => parseInt(num, 10));
		date = new Date(year, month - 1, day);
	}
	// Try Month DD, YYYY format
	else if (
		/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i.test(dateStr)
	) {
		date = new Date(dateStr);
	}
	// Default to returning the original string if not recognized
	else {
		return dateStr;
	}

	// If we couldn't parse the date properly, return the original
	if (isNaN(date.getTime())) {
		return dateStr;
	}

	// Return formatted date: YYYY-MM-DD
	return date.toISOString().split('T')[0];
}

/**
 * Groups transactions by month
 * @param transactions Array of transactions
 * @returns Object with month keys and transaction arrays
 */
export function groupTransactionsByMonth(
	transactions: Transaction[]
): Record<string, Transaction[]> {
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

/**
 * Generate a unique ID for a transaction
 * @returns A unique string ID
 */
export function generateTransactionId(): number {
	return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * Extracts the year from a date string
 * @param dateStr Date string
 * @returns Year as number or undefined if parsing fails
 */
export function extractYear(dateStr: string): number | undefined {
	try {
		// Try MM/DD/YYYY format
		if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
			const parts = dateStr.split('/');
			return parseInt(parts[2], 10);
		}
		// Try Month DD, YYYY format
		else if (
			/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i.test(dateStr)
		) {
			const date = new Date(dateStr);
			if (!isNaN(date.getTime())) {
				return date.getFullYear();
			}
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/**
 * Creates a downloader for any type of file
 * @param data The file data
 * @param filename The filename to use
 * @param mimeType The MIME type of the file
 */
export function downloadFile(data: string, filename: string, mimeType: string): void {
	const blob = new Blob([data], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.display = 'none';

	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	// Clean up the URL object
	setTimeout(() => URL.revokeObjectURL(url), 100);
}
