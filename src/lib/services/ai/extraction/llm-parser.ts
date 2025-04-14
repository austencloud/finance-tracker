// src/lib/services/ai/extraction/llm-parser.ts
import type { Transaction, Category } from '$lib/types'; // Make sure Category is imported
import { v4 as uuidv4 } from 'uuid'; // Import UUID
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '../../categorizer'; // Adjust path as needed
import { formatCurrency } from '$lib/utils/currency'; // Import for clarification message

/**
 * Parses a JSON string (potentially malformed) from the LLM response
 * into an array of Transaction objects. Includes extensive error handling and fixing.
 * @param jsonString The raw string response from the LLM, expected to contain JSON.
 * @returns An array of validated Transaction objects.
 */
export function parseTransactionsFromLLMResponse(jsonString: string): Transaction[] {
	console.log('[LLM Parser] Attempting to parse JSON response...');

	if (!jsonString || typeof jsonString !== 'string' || jsonString.trim().length === 0) {
		console.warn('[LLM Parser] Received empty or invalid input string.');
		return [];
	}

	let rawTransactions: any[] = [];

	try {
		// --- Attempt 1: Direct Parse ---
		try {
			const data = JSON.parse(jsonString);
			if (data && Array.isArray(data.transactions)) {
				console.log('[LLM Parser] Success: Direct parse of { transactions: [...] }');
				rawTransactions = data.transactions;
				// Proceed to validation below
			} else if (data && Array.isArray(data)) {
				// Handle case where response is just the array
				console.log('[LLM Parser] Success: Direct parse of [...]');
				rawTransactions = data;
                 // Proceed to validation below
			} else {
                 throw new Error("Parsed JSON is not an array or {transactions: []}");
            }
		} catch (e) {
			console.warn(
				'[LLM Parser] Attempt 1 (Direct Parse) failed. Trying extraction.',
				e instanceof Error ? e.message : e
			);
            // --- Attempt 2: Extract JSON Object/Array ---
            const objectMatch = jsonString.match(/\{[\s\S]*\}/);
            const arrayMatch = jsonString.match(/\[[\s\S]*\]/);

            let parsedSuccessfully = false;
            if (objectMatch) {
                try {
                    const data = JSON.parse(objectMatch[0]);
                    if (data && Array.isArray(data.transactions)) {
                        console.log('[LLM Parser] Success: Extracted and parsed { transactions: [...] }');
                        rawTransactions = data.transactions;
                        parsedSuccessfully = true;
                    }
                } catch (e2) { /* Ignore inner error */ }
            }

            if (!parsedSuccessfully && arrayMatch) {
                try {
                    const data = JSON.parse(arrayMatch[0]);
                    if (Array.isArray(data)) {
                        console.log('[LLM Parser] Success: Extracted and parsed [...]');
                        rawTransactions = data;
                        parsedSuccessfully = true;
                    }
                } catch (e3) { /* Ignore inner error */ }
            }

            if (!parsedSuccessfully) {
                 // --- Attempt 3: Fix Common JSON Errors and Retry ---
                console.log('[LLM Parser] Trying to fix common JSON errors...');
                const fixedJson = fixCommonJsonErrors(jsonString);
                try {
                    const data = JSON.parse(fixedJson);
                    if (data && Array.isArray(data.transactions)) {
                        console.log('[LLM Parser] Success: Parsed { transactions: [...] } after fixing.');
                        rawTransactions = data.transactions;
                        parsedSuccessfully = true;
                    } else if (data && Array.isArray(data)) {
                        console.log('[LLM Parser] Success: Parsed [...] after fixing.');
                        rawTransactions = data;
                        parsedSuccessfully = true;
                    } else {
                         throw new Error("Parsed fixed JSON is not an array or {transactions: []}");
                    }
                } catch (e4) {
                    console.warn(
                        '[LLM Parser] Attempt 3 (Parse after Fix) failed.',
                        e4 instanceof Error ? e4.message : e4
                    );
                    // --- Attempt 4: Extract Individual Transaction-like Objects ---
                    console.log('[LLM Parser] Trying to extract individual transaction objects...');
                    const individualTransactions = extractIndividualTransactions(fixedJson); // Use fixed JSON
                    if (individualTransactions.length > 0) {
                        console.log(
                            `[LLM Parser] Success: Extracted ${individualTransactions.length} individual transactions.`
                        );
                        rawTransactions = individualTransactions;
                        parsedSuccessfully = true;
                    } else {
                         // --- Failure ---
                        console.error('[LLM Parser] All parsing attempts failed.');
                        console.error('[LLM Parser] Raw response was:', jsonString); // Log the problematic response
                        return [];
                    }
                }
            }
		}

        // --- Validation Step ---
        return convertAndValidateTransactions(rawTransactions);

	} catch (error) {
		console.error('[LLM Parser] Unexpected error during parsing process:', error);
		return [];
	}
}

/**
 * Attempts to fix common JSON syntax errors often produced by LLMs.
 * @param jsonStr The potentially malformed JSON string.
 * @returns A string with attempted fixes.
 */
export function fixCommonJsonErrors(jsonStr: string): string {
	if (!jsonStr || typeof jsonStr !== 'string') return '';
	let fixed = jsonStr.trim();

	// Remove leading/trailing non-JSON characters (like ```json ... ```)
	fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	fixed = fixed.replace(/^```\s*/, '').replace(/\s*```$/, ''); // Handle case with just ```

	// Remove Pythonic None/True/False
	fixed = fixed.replace(/\bNone\b/g, 'null');
	fixed = fixed.replace(/\bTrue\b/g, 'true');
	fixed = fixed.replace(/\bFalse\b/g, 'false');

	// Add missing quotes around keys that start with a letter or underscore
    // Be less aggressive to avoid quoting numbers or already quoted strings
	fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

	// Fix trailing commas before closing brackets/braces
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');

	// Add missing commas between elements/properties (basic cases)
	fixed = fixed.replace(
		/(\"(?:\\\"|[^"])*\"\s*:\s*(?:\"(?:\\\"|[^"])*\"|\d+(?:\.\d+)?|true|false|null))\s+(\"[a-zA-Z_])/g,
		'$1, $2'
	); // Between properties: "...value" "key..." -> "...value", "key..."
    fixed = fixed.replace(/(\})\s*(\{)/g, '$1, $2'); // Between objects in array: } { -> }, {
    fixed = fixed.replace(/(\])\s*(\{)/g, '$1, $2'); // Between array end and object start ] { -> ], {
    fixed = fixed.replace(/(\])\s*(\[)/g, '$1, $2'); // Between arrays ] [ -> ], [
    fixed = fixed.replace(/(\")\s*(\")/g, '$1, $2'); // Between string values " " -> ", "
    fixed = fixed.replace(/(\d)\s*(\")/g, '$1, $2'); // Between number and string 1 " -> 1, "
    fixed = fixed.replace(/(\")\s*(\{)/g, '$1, $2'); // Between string and object " { -> ", {
    fixed = fixed.replace(/(true|false|null)\s*(\")/g, '$1, $2'); // Between literal and string true " -> true, "
    fixed = fixed.replace(/(true|false|null)\s*(\{)/g, '$1, $2'); // Between literal and object true { -> true, {


	// Remove comments (though JSON spec doesn't allow them)
	fixed = fixed.replace(/\/\/.*$/gm, ''); // Remove // comments
	fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

	// Remove invalid control characters
	// eslint-disable-next-line no-control-regex
	fixed = fixed.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

	return fixed;
}

/**
 * Extracts JSON objects that look like transactions from a potentially malformed string.
 * @param jsonString The string containing potential transaction objects.
 * @returns An array of potential transaction objects (as strings or parsed objects).
 */
function extractIndividualTransactions(jsonString: string): any[] {
	const transactions: any[] = [];
	const objectRegex = /\{(?:[^{}]*?"amount"[^{}]*?)(?:[^{}]*?"date"[^{}]*?|[^{}]*?"description"[^{}]*?)[^{}]*?\}/g;
	let match;

	while ((match = objectRegex.exec(jsonString)) !== null) {
		try {
            const potentialObjectString = match[0];
			const potentialTransaction = JSON.parse(potentialObjectString);
			if (
				potentialTransaction &&
				typeof potentialTransaction === 'object' &&
				potentialTransaction.amount !== undefined &&
				(potentialTransaction.description || potentialTransaction.date)
			) {
				transactions.push(potentialTransaction);
			}
		} catch (e) {
			console.warn(
				'[LLM Parser - Individual] Failed to parse potential transaction:',
				match[0],
				e instanceof Error ? e.message : e
			);
			try {
				const fixedMatch = fixCommonJsonErrors(match[0]);
				const potentialTransactionFixed = JSON.parse(fixedMatch);
				if (
					potentialTransactionFixed &&
					typeof potentialTransactionFixed === 'object' &&
					potentialTransactionFixed.amount !== undefined &&
					(potentialTransactionFixed.description || potentialTransactionFixed.date)
				) {
					transactions.push(potentialTransactionFixed);
					console.log('[LLM Parser - Individual] Parsed after fixing individual match.');
				}
			} catch (fixError) {
				console.warn(
					'[LLM Parser - Individual] Failed to parse even after fixing individual match.'
				);
			}
		}
	}
	return transactions;
}

/**
 * Converts raw transaction data (from LLM) into the application's Transaction format,
 * performing validation and data type conversions. Uses UUIDs for IDs.
 * @param rawTransactions An array of raw transaction objects.
 * @returns An array of validated Transaction objects.
 */
function convertAndValidateTransactions(rawTransactions: any[]): Transaction[] {
	if (!Array.isArray(rawTransactions)) {
		console.error('[LLM Parser - Validation] Input is not an array:', rawTransactions);
		return [];
	}

	const validatedTransactions: Transaction[] = [];

	rawTransactions.forEach((txn: any, index: number) => {
		if (!txn || typeof txn !== 'object') {
			console.warn(`[LLM Parser - Validation] Skipping invalid item at index ${index}:`, txn);
			return;
		}

		// --- Data Extraction and Type Coercion ---
		let date = 'unknown';
		if (txn.date && typeof txn.date === 'string') {
			const resolved = resolveAndFormatDate(txn.date);
			if (resolved !== 'unknown') {
                 date = resolved;
            } else if (/\d{4}-\d{2}-\d{2}/.test(txn.date)) {
                 date = txn.date;
            }
		}

		const description =
			typeof txn.description === 'string' && txn.description.trim()
				? txn.description.trim()
				: 'unknown';

		let direction: 'in' | 'out' | 'unknown' = 'unknown';
		if (typeof txn.direction === 'string') {
			const dir = txn.direction.toUpperCase().trim();
			if (dir === 'IN') direction = 'in';
			else if (dir === 'OUT') direction = 'out';
			else if (dir === 'UNKNOWN') direction = 'unknown';
		}

		let amount = 0;
		if (typeof txn.amount === 'number' && !isNaN(txn.amount)) {
			amount = Math.abs(txn.amount);
		} else if (typeof txn.amount === 'string') {
			const cleanedAmount = txn.amount.replace(/[$,\s]/g, '');
            const isNegative = /^\(.*\)$/.test(cleanedAmount);
			const parsedAmount = parseFloat(cleanedAmount.replace(/[()]/g, ''));
			if (!isNaN(parsedAmount)) {
				amount = Math.abs(parsedAmount);
                if (direction === 'unknown' && (parsedAmount < 0 || isNegative)) {
                    direction = 'out';
                    console.log(`[LLM Parser - Validation] Inferred direction 'out' from negative amount for: ${description}`);
                }
			}
		}

		let type = typeof txn.type === 'string' && txn.type.trim() ? txn.type.trim() : 'unknown';
        if (type !== 'unknown') {
            const lowerType = type.toLowerCase();
            if (lowerType.includes('card')) type = 'Card';
            else if (lowerType.includes('ach')) type = 'ACH';
            else if (lowerType.includes('zelle')) type = 'Zelle';
            else if (lowerType.includes('paypal')) type = 'PayPal';
            else if (lowerType.includes('transfer')) type = 'Transfer';
            else if (lowerType.includes('deposit')) type = 'Deposit';
            else if (lowerType.includes('withdrawal')) type = 'Withdrawal';
            else if (lowerType.includes('check')) type = 'Check';
            else if (lowerType.includes('cash')) type = 'Cash';
        }

		const notes = typeof txn.details === 'string' ? txn.details.trim() : '';

		// --- Validation ---
		if (amount <= 0 || (description === 'unknown' && date === 'unknown')) {
			console.warn(
				`[LLM Parser - Validation] Skipping transaction due to missing amount/description/date:`,
				txn
			);
			return;
		}

		// --- Direction Inference (if still unknown) ---
		if (direction === 'unknown') {
			const combinedText = (description + ' ' + type).toLowerCase();
			if (
				combinedText.includes('credit') ||
				combinedText.includes('deposit') ||
				combinedText.includes('received') ||
                combinedText.includes('payment from') ||
                description.toLowerCase().includes('sparkles enterta payroll')
			) {
				direction = 'in';
				console.log(`[LLM Parser - Validation] Inferred direction 'in' from keywords for: ${description}`);
			} else if (
				combinedText.includes('debit') ||
				combinedText.includes('payment') ||
				combinedText.includes('purchase') ||
				combinedText.includes('withdrawal') ||
                combinedText.includes('charge') ||
                combinedText.includes('bought') ||
                type === 'Card' ||
                type === 'ATM'
			) {
				direction = 'out';
				console.log(`[LLM Parser - Validation] Inferred direction 'out' from keywords/type for: ${description}`);
			} else {
				console.warn(
					`[LLM Parser - Validation] Could not determine direction for transaction, leaving as 'unknown':`,
					txn
				);
			}
		}

		// --- Categorization ---
		const category =
			categorizeTransaction(description, type) ||
			(direction === 'out' ? 'Expenses' : 'Other / Uncategorized');

		// --- Create Final Object ---
		validatedTransactions.push({
			id: uuidv4(), // *** USE UUID (string) ***
			date,
			description,
			type,
			amount: amount, // Ensure amount is number
			category,
			notes,
			direction
		});
	});

	console.log(
		`[LLM Parser - Validation] Successfully validated ${validatedTransactions.length} out of ${rawTransactions.length} raw transactions.`
	);
	return validatedTransactions;
}
