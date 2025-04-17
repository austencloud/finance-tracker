// src/lib/utils/date.ts
import * as chrono from 'chrono-node';

/**
 * Tries to parse a date string (accepting various formats) and returns YYYY-MM-DD.
 * Handles relative terms.
 * *** UPDATED: Defaults to TODAY'S date if parsing fails or input is invalid/unknown. ***
 * @param dateStr The input date string.
 * @returns Date string in YYYY-MM-DD format.
 */
export function resolveAndFormatDate(dateStr: string | undefined | null): string {
    const today = new Date(); // Reference date for relative parsing AND default
    // Format today's date immediately for fallback use
    const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // --- Condition 1: Handle empty or clearly invalid input ---
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
        console.warn(`[resolveAndFormatDate] No date string provided, defaulting to today: ${todayDateString}`);
        return todayDateString; // Default to today
    }

    const trimmedDateStr = dateStr.trim();

    // --- Condition 2: Handle explicit "unknown" or placeholder from LLM ---
    // Also check for simple relative terms Chrono might miss sometimes
    const lowerTrimmed = trimmedDateStr.toLowerCase();
    if (lowerTrimmed === 'unknown' || trimmedDateStr === 'YYYY-MM-DD' || lowerTrimmed === 'today') {
         console.warn(`[resolveAndFormatDate] Received '${trimmedDateStr}', defaulting to today: ${todayDateString}`);
        return todayDateString; // Default to today
    }
     if (lowerTrimmed === 'yesterday') {
         const yesterday = new Date(today);
         yesterday.setDate(today.getDate() - 1);
         return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
     }


    // --- Condition 3: Attempt parsing with Chrono ---
    try {
        const results = chrono.parse(trimmedDateStr, today); // Use today as reference

        if (results.length === 0) {
             console.warn(`[resolveAndFormatDate] Chrono couldn't parse '${trimmedDateStr}', defaulting to today: ${todayDateString}`);
            // Fallback: Default to today's date if Chrono fails
            return todayDateString;
        }

        // Use the first parse result
        const parsedDate = results[0].start.date();
        if (isNaN(parsedDate.getTime())) {
             console.warn(`[resolveAndFormatDate] Chrono parsed invalid date from '${trimmedDateStr}', defaulting to today: ${todayDateString}`);
            return todayDateString; // Default to today if Chrono result is invalid JS Date
        }

        // Return Chrono result in YYYY-MM-DD format
        const year = parsedDate.getFullYear();
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        // console.log(`[resolveAndFormatDate] Parsed '${trimmedDateStr}' to ${formattedDate}`);
        return formattedDate;

    } catch (error) {
        console.error(`[resolveAndFormatDate] Error during Chrono parsing for '${trimmedDateStr}':`, error);
        return todayDateString; // Default to today on unexpected error
    }
}

// Other functions like formatDate, extractYear, groupTransactionsByMonth remain as they were
// unless you need to update their date handling as well. formatDate and extractYear
// seem less critical now that resolveAndFormatDate is the primary parser.

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
