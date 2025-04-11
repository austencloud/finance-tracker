// src/utils/transaction-extractor.ts
import type { Transaction, Category } from '../types'; // Ensure Category is imported if used by categorizeTransaction
import { getExtractionPrompt } from './llm-prompts';
import { ollamaGenerateJson } from './llm-client';
import { generateTransactionId } from './helpers'; // Assuming helpers.ts exists
import { categorizeTransaction } from './categorizer'; // Assuming categorizer.ts exists

/**
 * Extracts structured transaction data from raw text using an LLM.
 * @param text - The input text containing potential transaction data.
 * @returns A promise resolving to an array of extracted Transactions.
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	console.log('[extractTransactionsFromText] START extracting from:', text);
	const extractionPrompt = getExtractionPrompt(text); // Get the specialized prompt
	try {
		// Use the dedicated client function for JSON generation
		const rawJsonResponse = await ollamaGenerateJson(extractionPrompt);
		console.log('[extractTransactionsFromText] Raw LLM response string:', rawJsonResponse);

		// Clean and parse the JSON response
		const parsedTransactions = parseTransactionsFromLLMResponse(rawJsonResponse); // Use local parser function
		console.log('[extractTransactionsFromText] Parsing result:', parsedTransactions);
		return parsedTransactions;
	} catch (error) {
		console.error('[extractTransactionsFromText] Error:', error);
		return []; // Return empty array on error
	}
}

// --- Helper functions (Defined locally) ---

/**
 * Parses transactions from a raw LLM JSON response string.
 */
export function parseTransactionsFromLLMResponse(jsonString: string): Transaction[] {
	console.log(
		'[parseTransactionsFromLLMResponse] Attempting to parse JSON:',
		jsonString.substring(0, 200) + '...'
	);
	try {
		// Clean the raw response string before parsing
		const startIndex = jsonString.indexOf('{');
		const endIndex = jsonString.lastIndexOf('}');
		let potentialJson = '';

		if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
			potentialJson = jsonString.substring(startIndex, endIndex + 1);
		} else {
			// Attempt to find array markers if object markers fail
			const arrayStartIndex = jsonString.indexOf('[');
			const arrayEndIndex = jsonString.lastIndexOf(']');
			if (arrayStartIndex !== -1 && arrayEndIndex !== -1 && arrayEndIndex >= arrayStartIndex) {
				const potentialArray = jsonString.substring(arrayStartIndex, arrayEndIndex + 1);
				try {
					JSON.parse(potentialArray); // Check if valid array
					potentialJson = `{ "transactions": ${potentialArray} }`; // Wrap it
				} catch (e) {
					console.warn(
						'[parseTransactionsFromLLMResponse] Found array markers but content is not valid JSON array:',
						potentialArray
					);
					potentialJson = '';
				}
			} else {
				console.warn(
					'[parseTransactionsFromLLMResponse] Could not find valid JSON object/array markers in LLM response string:',
					jsonString
				);
				potentialJson = '';
			}
		}

		if (!potentialJson) {
			console.log(
				'[parseTransactionsFromLLMResponse] No valid JSON found after cleaning. Returning [].'
			);
			return [];
		}

		// Attempt to parse the cleaned JSON
		let parsedData;
		try {
			parsedData = JSON.parse(potentialJson);
		} catch (e) {
			console.warn(
				'[parseTransactionsFromLLMResponse] Initial JSON parse failed. Attempting fixes...'
			);
			const fixedJson = fixCommonJsonErrors(potentialJson); // Use local fix function
			try {
				parsedData = JSON.parse(fixedJson);
				console.log('[parseTransactionsFromLLMResponse] Parsing successful after fixes.');
			} catch (e2) {
				console.error(
					'[parseTransactionsFromLLMResponse] Error parsing JSON even after fixes:',
					e2
				);
				console.error('[parseTransactionsFromLLMResponse] Faulty JSON string:', potentialJson);
				return [];
			}
		}

		// Check structure and convert
		if (parsedData && parsedData.transactions && Array.isArray(parsedData.transactions)) {
			console.log(
				`[parseTransactionsFromLLMResponse] Found ${parsedData.transactions.length} transactions in JSON.`
			);
			// Use local conversion function
			return convertLLMTransactionsToAppFormat(parsedData.transactions);
		} else {
			console.warn(
				'[parseTransactionsFromLLMResponse] Parsed data missing "transactions" array.',
				parsedData
			);
			return [];
		}
	} catch (error) {
		console.error('[parseTransactionsFromLLMResponse] Unexpected error during parsing:', error);
		return [];
	}
}

/**
 * Fix common JSON errors sometimes produced by LLMs.
 */
function fixCommonJsonErrors(jsonStr: string): string {
	let fixed = jsonStr;
	// Fix trailing commas in arrays/objects before closing bracket/brace
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');
	// Add other common fixes if needed
	return fixed;
}

/**
 * Converts LLM transaction data structure to the application's Transaction type.
 * Ensures all required fields, including 'direction', are present.
 */
function convertLLMTransactionsToAppFormat(llmTransactions: any[]): Transaction[] {
	return llmTransactions
		.map((txn: any, index: number) => {
			// Basic validation and type coercion
			const date = typeof txn.date === 'string' ? txn.date : 'unknown';
			const description = typeof txn.description === 'string' ? txn.description : 'unknown';
			const details = typeof txn.details === 'string' ? txn.details : '';
			const type = typeof txn.type === 'string' ? txn.type : 'unknown';

			// --- Process Direction ---
            // Explicitly define the type for direction based on Transaction type
            let direction: 'in' | 'out' | 'unknown' = 'unknown';
            if (typeof txn.direction === 'string') {
                const upperDir = txn.direction.toUpperCase();
                if (upperDir === 'IN') {
                    direction = 'in';
                } else if (upperDir === 'OUT') {
                    direction = 'out';
                }
            }
            // --- End Process Direction ---


			let amountValue = 0;
			if (typeof txn.amount === 'number') {
				amountValue = txn.amount;
			} else if (typeof txn.amount === 'string') {
				amountValue = parseFloat(txn.amount.replace(/[$,]/g, '')) || 0;
			}

			// Determine category
            // Ensure 'direction' used here matches the variable above
			const category =
				direction === 'out' && description !== 'unknown'
					? categorizeTransaction(description, type)
					: direction === 'in'
					? 'Other / Uncategorized' // Default income category
					: categorizeTransaction(description, type); // Categorize unknown direction too?

			// Handle cases where categorizer might return 'Expenses' for an 'in' direction
			const finalCategory: Category = // Explicitly type if Category is imported
				direction === 'in' && category === 'Expenses' ? 'Other / Uncategorized' : category;

			// --- Return object matching Transaction type ---
			return {
				id: generateTransactionId() + index, // Add index for more unique ID during mapping
				date: date,
				description: description,
				type: type,
				amount: amountValue,
				category: finalCategory,
				notes: details,
				direction: direction, // Ensure direction is included
			};
			// --- End Return object ---
		})
		// Filter out results that are essentially empty after parsing/conversion
		.filter(t => t !== null && (t.amount !== 0 || (t.description !== 'unknown' && t.description !== '')));
}
