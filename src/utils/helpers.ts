// src/utils/helpers.ts

/**
 * Formats a number as currency
 * @param amount The amount to format
 * @returns Formatted currency string
 */

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
// src/utils/helpers.ts
import type { Transaction } from '../types';

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
 * Tries to parse a date string (accepting various formats) and returns YYYY-MM-DD.
 * Handles relative terms "today" and "yesterday".
 * @param dateStr The input date string.
 * @returns Date string in YYYY-MM-DD format, or the original string if not recognized/parsable, or 'unknown'.
 */
export function resolveAndFormatDate(dateStr: string | undefined | null): string {
	if (
		!dateStr ||
		typeof dateStr !== 'string' ||
		dateStr.trim() === '' ||
		dateStr.trim().toLowerCase() === 'unknown'
	) {
		return 'unknown';
	}

	const lowerDateStr = dateStr.toLowerCase().trim();
	const today = new Date();
	today.setHours(0, 0, 0, 0); // Normalize to start of day

	let resolvedDate: Date | null = null;

	// Handle relative dates
	if (lowerDateStr === 'today') {
		resolvedDate = today;
	} else if (lowerDateStr === 'yesterday') {
		resolvedDate = new Date(today);
		resolvedDate.setDate(today.getDate() - 1);
	}
	// Add more relative terms here if needed (e.g., 'tomorrow', 'last friday')

	// If not resolved relatively, try direct parsing
	if (!resolvedDate) {
		try {
			const parsed = new Date(dateStr);
			// Check for invalid date (e.g., Date("invalid string") -> Invalid Date)
			if (!isNaN(parsed.getTime())) {
				// Basic sanity check for year (e.g., avoid 1970 from bad parsing)
				if (parsed.getFullYear() > 1980 && parsed.getFullYear() < 2100) {
					resolvedDate = parsed;
					resolvedDate.setHours(0, 0, 0, 0); // Normalize
				}
			}
		} catch (e) {
			// Ignore parsing errors, will return original string below
			console.warn(`[resolveAndFormatDate] Could not parse date: ${dateStr}`);
		}
	}

	// Format if resolved
	if (resolvedDate) {
		const year = resolvedDate.getFullYear();
		const month = String(resolvedDate.getMonth() + 1).padStart(2, '0');
		const day = String(resolvedDate.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Return original string if it couldn't be parsed/resolved
	console.warn(`[resolveAndFormatDate] Returning original unparsed date: ${dateStr}`);
	return dateStr;
}

/**
 * Generate a unique ID for a transaction (simple version)
 * @returns A unique number ID
 */
export function generateTransactionId(): number {
	// Combine timestamp with random number for better uniqueness chance
	return Date.now() + Math.floor(Math.random() * 10000);
}

// Keep other helper functions if they exist (like groupTransactionsByMonth, etc.)
// formatDate might be replaced by resolveAndFormatDate depending on usage
// export function formatDate(dateStr: string): string { ... }
