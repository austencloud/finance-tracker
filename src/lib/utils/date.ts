// src/lib/utils/date.ts
import * as chrono from 'chrono-node';

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
 * Tries to parse a date string (accepting various formats) and returns YYYY-MM-DD.
 * Handles relative terms "today" and "yesterday".
 * @param dateStr The input date string.
 * @returns Date string in YYYY-MM-DD format, or the original string if not recognized/parsable, or 'unknown'.

/**
 * Instead of naive checks for 'today', 'yesterday', parse with Chrono.
 */
export function resolveAndFormatDate(dateStr: string | undefined | null): string {
	if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
		return 'unknown';
	}

	// Optionally detect if user typed "unknown"
	if (dateStr.trim().toLowerCase() === 'unknown') {
		return 'unknown';
	}

	// For reference, let's assume 'today' is the actual system date
	const today = new Date(); // or pass a reference date from outside if needed
	const results = chrono.parse(dateStr, today);
	if (results.length === 0) {
		// Could not parse with chrono, fallback to your original logic or just return dateStr
		return dateStr;
	}

	// Use the first parse result
	const parsedDate = results[0].start.date();
	if (isNaN(parsedDate.getTime())) {
		return dateStr; // can't parse
	}

	// Return in YYYY-MM-DD format
	const year = parsedDate.getFullYear();
	const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
	const day = String(parsedDate.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Groups transactions by month
 * @param transactions Array of transactions
 * @returns Object with month keys and transaction arrays
 */
export function groupTransactionsByMonth(transactions: any[]): Record<string, any[]> {
	const grouped: Record<string, any[]> = {};

	transactions.forEach((transaction) => {
		try {
			let date: Date;

			// Try to parse various date formats
			if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(transaction.date)) {
				const [month, day, year] = transaction.date
					.split('/')
					.map((num: string) => parseInt(num, 10));
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
