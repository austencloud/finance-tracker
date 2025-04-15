import { categorizeTransaction } from '$lib/services/categorizer';
import type { Transaction, Category } from '$lib/types'; // Import necessary types

/**
 * Generate a unique ID for a transaction
 * @returns A unique number ID (consider using UUID for true uniqueness if needed)
 */
export function generateTransactionId(): number {
	// Combine timestamp with random number for better uniqueness chance
	return Date.now() + Math.floor(Math.random() * 10000);
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

/**
 * Basic heuristic check if a string looks like it might contain transaction data.
 * @param text - The input string.
 * @returns True if the text might contain transaction data, false otherwise.
 */
export function textLooksLikeTransaction(text: string): boolean {
	const lowerText = text.toLowerCase();
	// Look for currency symbols OR numbers
	const hasAmount =
		/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd|cad|eur|gbp)/i.test(
			lowerText
		) || /\b\d+\b/.test(lowerText);
	// Look for action keywords
	const hasKeyword =
		/\b(spent|paid|bought|sold|received|deposit|income|expense|cost|got|transfer|sent|charge|fee|payment|salary|invoice|refund)\b/i.test(
			lowerText
		);
	// Look for date-related keywords/formats
	const hasDate =
		/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}|\b(yesterday|today|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
			lowerText
		);

	// Require an amount OR (a keyword AND a date) for it to look plausible
	return hasAmount || (hasKeyword && hasDate);
}

// --- Added Helper Functions ---

/**
 * Simple currency formatter (USD). Replace with a more robust library if needed.
 * @param amount The numeric amount.
 * @returns Formatted currency string.
 */
export function formatCurrency(amount: number): string {
	// Handle potential null/undefined/NaN inputs gracefully
	if (typeof amount !== 'number' || isNaN(amount)) {
		return '$0.00'; // Or return an empty string, or throw an error
	}
	return `$${amount.toFixed(2)}`;
}

/**
 * Attempts to fix common JSON errors in LLM responses.
 * @param jsonStr The potentially malformed JSON string.
 * @returns A string with attempted fixes.
 */
export function fixCommonJsonErrors(jsonStr: string): string {
	if (!jsonStr || typeof jsonStr !== 'string') return '';
	let fixed = jsonStr.trim();
	// Remove markdown code fences
	fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	// Replace Python/JS boolean/null literals
	fixed = fixed.replace(/\bNone\b/g, 'null');
	fixed = fixed.replace(/\bTrue\b/g, 'true');
	fixed = fixed.replace(/\bFalse\b/g, 'false');
	// Add quotes around keys that might be missing them
	fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
	// Remove trailing commas before closing brackets/braces
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');
	// Add more fixes here if needed
	return fixed;
}

/**
 * Parses JSON from AI response, attempting to fix common errors.
 * @param jsonResponse The raw string response from the AI.
 * @returns Parsed JSON object or array, or null if parsing fails.
 */
export function parseJsonFromAiResponse<T = any>(jsonResponse: string): T | null {
	if (!jsonResponse || typeof jsonResponse !== 'string') {
		return null;
	}
	try {
		// First attempt direct parsing
		return JSON.parse(jsonResponse);
	} catch (e) {
		console.warn('[parseJsonFromAiResponse] Initial JSON parse failed, attempting to fix...');
		try {
			// Attempt to fix common errors and parse again
			const fixedJson = fixCommonJsonErrors(jsonResponse);
			return JSON.parse(fixedJson);
		} catch (fixError) {
			console.error('[parseJsonFromAiResponse] Failed to parse JSON even after fixing:', fixError);
			// console.error('[parseJsonFromAiResponse] Original problematic JSON string:', jsonResponse); // Optional: log original string on final failure
			return null; // Return null if parsing fails definitively
		}
	}
}

/**
 * Applies an explicit direction override (if provided) to a list of transactions.
 * Also adjusts category based on the new direction.
 * @param transactions The list of transactions to potentially modify.
 * @param explicitDirection 'in', 'out', or null.
 * @returns The modified list of transactions.
 */
export function applyExplicitDirection(
	transactions: Transaction[],
	explicitDirection: 'in' | 'out' | null
): Transaction[] {
	if (!explicitDirection) {
		return transactions;
	}

	// console.log(`[applyExplicitDirection] Applying explicit direction override: ${explicitDirection}`);
	return transactions.map((txn) => {
		let updatedTxn = { ...txn };
		if (updatedTxn.direction !== explicitDirection) {
			updatedTxn.direction = explicitDirection;

			// Adjust category based on the NEW direction
			if (explicitDirection === 'out') {
				// If the category wasn't already 'Expenses', set it to 'Expenses'.
				if (updatedTxn.category !== 'Expenses') {
					updatedTxn.category = 'Expenses'; // Default expense category
				}
			} else if (explicitDirection === 'in') {
				// If the category was 'Expenses', try to re-categorize or use a default income category.
				if (updatedTxn.category === 'Expenses') {
					// Use imported categorizeTransaction
					const potentialCategory = categorizeTransaction(updatedTxn.description, updatedTxn.type);
					// Use 'Other / Uncategorized' as fallback instead of 'Income' literal
					// NOTE: Ensure 'Other / Uncategorized' is a valid Category in your types.
					if (potentialCategory === 'Expenses') {
						updatedTxn.category = 'Other / Uncategorized';
					} else {
						updatedTxn.category = potentialCategory;
					}
				}
			}
		}
		return updatedTxn;
	});
}
