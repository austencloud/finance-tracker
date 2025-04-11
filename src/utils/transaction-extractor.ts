// src/utils/transaction-extractor.ts
import type { Transaction, Category } from '../types';
import { getExtractionPrompt } from './llm-prompts';
import { ollamaGenerateJson } from './llm-client';
import { generateTransactionId, resolveAndFormatDate } from './helpers';
import { categorizeTransaction } from './categorizer';

/**
 * Extracts structured transaction data from raw text using an LLM.
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	console.log('[extractTransactionsFromText] START extracting from:', text);
    const today = new Date().toISOString().split('T')[0];
	const extractionPrompt = getExtractionPrompt(text, today); // Pass date here
	try {
		const rawJsonResponse = await ollamaGenerateJson(extractionPrompt);
		console.log('[extractTransactionsFromText] Raw LLM response string:', rawJsonResponse);
		const parsedTransactions = parseTransactionsFromLLMResponse(rawJsonResponse);
		console.log('[extractTransactionsFromText] Parsing result:', parsedTransactions);
		return parsedTransactions;
	} catch (error) {
		console.error('[extractTransactionsFromText] Error:', error);
		return [];
	}
}

/**
 * Parses transactions from a raw LLM JSON response string.
 */
export function parseTransactionsFromLLMResponse(jsonString: string): Transaction[] {
	console.log('[parseTransactionsFromLLMResponse] Attempting to parse JSON:', jsonString.substring(0, 200) + '...');
	try {
		// ... (robust JSON cleaning/parsing logic from previous steps) ...
        const startIndex = jsonString.indexOf('{');
		const endIndex = jsonString.lastIndexOf('}');
		let potentialJson = '';
		if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
			potentialJson = jsonString.substring(startIndex, endIndex + 1);
		} else {
			const arrayStartIndex = jsonString.indexOf('[');
			const arrayEndIndex = jsonString.lastIndexOf(']');
			if (arrayStartIndex !== -1 && arrayEndIndex !== -1 && arrayEndIndex >= arrayStartIndex) {
				const potentialArray = jsonString.substring(arrayStartIndex, arrayEndIndex + 1);
				try { JSON.parse(potentialArray); potentialJson = `{ "transactions": ${potentialArray} }`; }
                catch (e) { potentialJson = ''; /* Handle error */ }
			} else { potentialJson = ''; /* Handle error */ }
		}
		if (!potentialJson) return [];
		let parsedData;
		try { parsedData = JSON.parse(potentialJson); }
        catch (e) {
            try { const fixedJson = fixCommonJsonErrors(potentialJson); parsedData = JSON.parse(fixedJson); }
            catch (e2) { console.error('Error parsing JSON even after fixes:', e2); return []; }
        }
		if (parsedData && parsedData.transactions && Array.isArray(parsedData.transactions)) {
			return convertLLMTransactionsToAppFormat(parsedData.transactions);
		} else { return []; }
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
	fixed = fixed.replace(/,\s*([\]}])/g, '$1'); // Fix trailing commas
	// Add more fixes if needed
	return fixed;
}

/**
 * Converts LLM transaction data structure to the application's Transaction type.
 */
function convertLLMTransactionsToAppFormat(llmTransactions: any[]): Transaction[] {
	return llmTransactions
		.map((txn: any, index: number): Transaction | null => { // Return Transaction | null from map
			const date = resolveAndFormatDate(txn.date);
			const description = typeof txn.description === 'string' ? txn.description : 'unknown';
			const details = typeof txn.details === 'string' ? txn.details : '';
			const type = typeof txn.type === 'string' ? txn.type : 'unknown';

            let direction: 'in' | 'out' | 'unknown' = 'unknown';
            if (typeof txn.direction === 'string') {
                const upperDir = txn.direction.toUpperCase();
                if (upperDir === 'IN') direction = 'in';
                else if (upperDir === 'OUT') direction = 'out';
            }

			let amountValue: number = 0; // Ensure amountValue is typed as number
			if (typeof txn.amount === 'number') {
				amountValue = txn.amount;
			} else if (typeof txn.amount === 'string') {
				amountValue = parseFloat(txn.amount.replace(/[$,]/g, '')) || 0;
			}

			const category =
				direction === 'out' && description !== 'unknown'
					? categorizeTransaction(description, type)
					: direction === 'in'
					? 'Other / Uncategorized'
					: categorizeTransaction(description, type);

			const finalCategory: Category =
				direction === 'in' && category === 'Expenses' ? 'Other / Uncategorized' : category;

            // Create the object matching the Transaction type
			const transactionObject: Transaction = { // Explicitly type the object
				id: generateTransactionId() + index,
				date: date,
				description: description,
				type: type,
				amount: amountValue, // Assign the number type
				category: finalCategory,
				notes: details,
				direction: direction,
			};

            // Basic check before returning from map
            if (transactionObject.amount === 0 && (transactionObject.description === 'unknown' || transactionObject.description === '')) {
                return null; // Return null for completely empty transactions
            }
            return transactionObject;
		})
		// Filter out the nulls, the remaining items are guaranteed to be Transaction
		.filter((t): t is Transaction => t !== null);
        // The filter condition is now just removing nulls, and the type predicate works
        // because the map explicitly returns Transaction | null.
}
