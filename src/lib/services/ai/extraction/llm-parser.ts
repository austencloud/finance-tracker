// src/lib/services/ai/extraction/llm-parser.ts
import type { Transaction } from '$lib/types';
import { generateTransactionId } from '$lib/utils/helpers'; // Assuming this returns number, though we replace its usage for batch uniqueness here
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '../../categorizer'; // Adjust path as needed

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
				return convertAndValidateTransactions(rawTransactions);
			}
			if (data && Array.isArray(data)) {
				// Handle case where response is just the array
				console.log('[LLM Parser] Success: Direct parse of [...]');
				rawTransactions = data;
				return convertAndValidateTransactions(rawTransactions);
			}
		} catch (e) {
			console.warn(
				'[LLM Parser] Attempt 1 (Direct Parse) failed. Trying extraction.',
				e instanceof Error ? e.message : e
			);
		}

		// --- Attempt 2: Extract JSON Object/Array ---
		// Try finding the outermost {} or []
		const objectMatch = jsonString.match(/\{[\s\S]*\}/);
		const arrayMatch = jsonString.match(/\[[\s\S]*\]/);

		if (objectMatch) {
			try {
				const data = JSON.parse(objectMatch[0]);
				if (data && Array.isArray(data.transactions)) {
					console.log('[LLM Parser] Success: Extracted and parsed { transactions: [...] }');
					rawTransactions = data.transactions;
					return convertAndValidateTransactions(rawTransactions);
				}
			} catch (e) {
				console.warn(
					'[LLM Parser] Attempt 2a (Object Extraction) failed.',
					e instanceof Error ? e.message : e
				);
			}
		}

		if (arrayMatch && rawTransactions.length === 0) {
			// Only try array if object failed
			try {
				const data = JSON.parse(arrayMatch[0]);
				if (Array.isArray(data)) {
					console.log('[LLM Parser] Success: Extracted and parsed [...]');
					rawTransactions = data;
					return convertAndValidateTransactions(rawTransactions);
				}
			} catch (e) {
				console.warn(
					'[LLM Parser] Attempt 2b (Array Extraction) failed.',
					e instanceof Error ? e.message : e
				);
			}
		}

		// --- Attempt 3: Fix Common JSON Errors and Retry ---
		console.log('[LLM Parser] Trying to fix common JSON errors...');
		const fixedJson = fixCommonJsonErrors(jsonString);
		try {
			const data = JSON.parse(fixedJson);
			if (data && Array.isArray(data.transactions)) {
				console.log('[LLM Parser] Success: Parsed { transactions: [...] } after fixing.');
				rawTransactions = data.transactions;
				return convertAndValidateTransactions(rawTransactions);
			}
			if (data && Array.isArray(data)) {
				console.log('[LLM Parser] Success: Parsed [...] after fixing.');
				rawTransactions = data;
				return convertAndValidateTransactions(rawTransactions);
			}
		} catch (e) {
			console.warn(
				'[LLM Parser] Attempt 3 (Parse after Fix) failed.',
				e instanceof Error ? e.message : e
			);
		}

		// --- Attempt 4: Extract transactions array specifically ---
		try {
			const transactionArrayMatch = fixedJson.match(/"transactions"\s*:\s*(\[[\s\S]*?\])/);
			if (transactionArrayMatch && transactionArrayMatch[1]) {
				const arrayText = transactionArrayMatch[1];
				const fixedArrayText = fixCommonJsonErrors(arrayText); // Fix the extracted array too
				const transactions = JSON.parse(fixedArrayText);
				if (Array.isArray(transactions)) {
					console.log(
						'[LLM Parser] Success: Extracted and parsed "transactions" array after fixing.'
					);
					rawTransactions = transactions;
					return convertAndValidateTransactions(rawTransactions);
				}
			}
		} catch (e) {
			console.warn(
				'[LLM Parser] Attempt 4 (Specific Array Extraction) failed.',
				e instanceof Error ? e.message : e
			);
		}

		// --- Attempt 5: Extract Individual Transaction-like Objects ---
		console.log('[LLM Parser] Trying to extract individual transaction objects...');
		const individualTransactions = extractIndividualTransactions(fixedJson); // Use fixed JSON
		if (individualTransactions.length > 0) {
			console.log(
				`[LLM Parser] Success: Extracted ${individualTransactions.length} individual transactions.`
			);
			rawTransactions = individualTransactions;
			return convertAndValidateTransactions(rawTransactions);
		}

		// --- Failure ---
		console.error('[LLM Parser] All parsing attempts failed.');
		console.error('[LLM Parser] Raw response was:', jsonString); // Log the problematic response
		return [];
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

	// Remove Pythonic None/True/False
	fixed = fixed.replace(/\bNone\b/g, 'null');
	fixed = fixed.replace(/\bTrue\b/g, 'true');
	fixed = fixed.replace(/\bFalse\b/g, 'false');

	// Add missing quotes around keys
	fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');

	// Fix single quotes to double quotes for strings
	// Be careful not to replace quotes within already correctly quoted strings
	// This requires a more stateful approach or careful regex
	try {
		// Attempt to parse and stringify to fix quotes and other minor issues
		// This is risky if the JSON is severely malformed
		// fixed = JSON.stringify(eval(`(${fixed})`)); // Avoid eval - too risky
	} catch {
		/* Ignore if eval fails */
	}

	// Fix trailing commas before closing brackets/braces
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');

	// Add missing commas between elements in an array or properties in an object
	// Example: { "a": 1 "b": 2 } -> { "a": 1, "b": 2 }
	fixed = fixed.replace(
		/(\"[^"]*\"\s*:\s*(?:\"[^"]*\"|\d+(?:\.\d+)?|true|false|null))\s+(\"[^"]*\")/g,
		'$1, $2'
	); // Between properties
	fixed = fixed.replace(/(\](?:\s*)|(?:\s*)\})\s*(\{)/g, '$1,\n$2'); // Between objects in array? } { -> }, {
	fixed = fixed.replace(/(\})\s*(\")/g, '$1,\n$2'); // Between property and next key "}" "key" -> "}, "key"
	fixed = fixed.replace(/(\])\s*(\{)/g, '$1,\n$2'); // Between array end and object start ] { -> ], {

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
	// Regex to find objects containing typical transaction keys
	const objectRegex =
		/\{(?:[^{}]*?"date"[^{}]*?|[^{}]*?"description"[^{}]*?|[^{}]*?"amount"[^{}]*?){2,}\}/g;
	let match;

	while ((match = objectRegex.exec(jsonString)) !== null) {
		try {
			// Try parsing the extracted object string
			const potentialTransaction = JSON.parse(match[0]);
			// Basic validation: does it have at least amount and description/date?
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
			// Optionally, try fixing the individual match string here before parsing
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
 * performing validation and data type conversions.
 * @param rawTransactions An array of raw transaction objects.
 * @returns An array of validated Transaction objects.
 */
function convertAndValidateTransactions(rawTransactions: any[]): Transaction[] {
	if (!Array.isArray(rawTransactions)) {
		console.error('[LLM Parser - Validation] Input is not an array:', rawTransactions);
		return [];
	}

	const validatedTransactions: Transaction[] = [];
	// Get a base timestamp for this batch to combine with index for uniqueness
	const batchTimestamp = Date.now();

	rawTransactions.forEach((txn: any, index: number) => {
		if (!txn || typeof txn !== 'object') {
			console.warn(`[LLM Parser - Validation] Skipping invalid item at index ${index}:`, txn);
			return; // Skip null or non-object items
		}

		// --- Data Extraction and Type Coercion ---
		let date = 'unknown';
		if (txn.date && typeof txn.date === 'string') {
			const resolved = resolveAndFormatDate(txn.date);
			if (resolved !== 'unknown') date = resolved;
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
		}

		let amount = 0;
		if (typeof txn.amount === 'number' && !isNaN(txn.amount)) {
			amount = Math.abs(txn.amount);
		} else if (typeof txn.amount === 'string') {
			const parsedAmount = parseFloat(txn.amount.replace(/[$,\s]/g, '')); // Remove $, commas, spaces
			if (!isNaN(parsedAmount)) {
				amount = Math.abs(parsedAmount);
			}
		}

		let type = typeof txn.type === 'string' && txn.type.trim() ? txn.type.trim() : 'unknown';
		// Simple type normalization
		if (type.toLowerCase().includes('card')) type = 'Card';
		else if (type.toLowerCase().includes('ach')) type = 'ACH';
		else if (type.toLowerCase().includes('zelle')) type = 'Zelle';
		else if (type.toLowerCase().includes('paypal')) type = 'PayPal';
		else if (type.toLowerCase().includes('transfer')) type = 'Transfer';

		const notes = typeof txn.details === 'string' ? txn.details.trim() : ''; // Use 'details' field for notes

		// --- Validation ---
		// Require at least an amount and some identifying info (desc or date)
		if (amount <= 0 || (description === 'unknown' && date === 'unknown')) {
			console.warn(
				`[LLM Parser - Validation] Skipping transaction due to missing amount/description/date:`,
				txn
			);
			return;
		}
		// If direction is unknown, try one last inference based on description/type
		if (direction === 'unknown') {
			const combinedText = (description + ' ' + type).toLowerCase();
			if (
				combinedText.includes('credit') ||
				combinedText.includes('deposit') ||
				combinedText.includes('received')
			) {
				direction = 'in';
			} else if (
				combinedText.includes('debit') ||
				combinedText.includes('payment') ||
				combinedText.includes('purchase') ||
				combinedText.includes('withdrawal')
			) {
				direction = 'out';
			} else {
				console.warn(
					`[LLM Parser - Validation] Could not determine direction for transaction:`,
					txn
				);
				// Decide whether to skip or default (e.g., default to 'out')
				// return; // Option: skip if direction is mandatory
				direction = 'out'; // Option: default to 'out'
			}
		}

		// --- Categorization ---
		const category =
			categorizeTransaction(description, type) ||
			(direction === 'out' ? 'Expenses' : 'Other / Uncategorized');

		// --- Create Final Object ---
		validatedTransactions.push({
			// id: generateTransactionId() + `-${index}`, // OLD - Creates string
			// --- FIX START ---
			// Combine timestamp with index to create a unique numeric ID for this batch
			// Note: Assumes processing is fast enough that timestamp + index won't collide.
			// If generateTransactionId() *is* designed for rapid unique number generation,
			// you might use it instead, potentially adding index if needed:
			// id: generateTransactionId() + index, // Alternative if generateTransactionId returns unique number per call
			id: batchTimestamp + index,
			// --- FIX END ---
			date,
			description,
			type,
			amount, // Keep amount as number for consistency internally
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
