// src/lib/services/ai/extraction.ts
import type { Transaction } from '$lib/types';
import { generateTransactionId } from '$lib/utils/helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '../categorizer';
import { ollamaGenerateJson } from './llm-client';
import { getExtractionPrompt } from './prompts';
import * as chrono from 'chrono-node';

/**
 * Extracts structured transaction data from raw text using an LLM.
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	console.log('[extractTransactionsFromText] START extracting from:', text);
	const today = new Date().toISOString().split('T')[0];
	const extractionPrompt = getExtractionPrompt(text, today);

	try {
		const rawJsonResponse = await ollamaGenerateJson(extractionPrompt);
		console.log('[extractTransactionsFromText] Raw LLM response string:', rawJsonResponse);

		// If the LLM returns an empty object or invalid data, do basic extraction
		if (rawJsonResponse.trim() === '{}' || !rawJsonResponse.includes('transactions')) {
			console.log(
				'[extractTransactionsFromText] LLM returned empty data, using fallback extraction'
			);
			return fallbackExtraction(text, today);
		}

		const parsedTransactions = parseTransactionsFromLLMResponse(rawJsonResponse);
		console.log('[extractTransactionsFromText] Parsing result:', parsedTransactions);

		// If LLM parsing gave no results, fall back to basic extraction
		if (parsedTransactions.length === 0) {
			console.log(
				'[extractTransactionsFromText] No transactions from LLM, using fallback extraction'
			);
			return fallbackExtraction(text, today);
		}

		return parsedTransactions;
	} catch (error) {
		console.error('[extractTransactionsFromText] Error:', error);
		// Use fallback in case of any errors
		return fallbackExtraction(text, today);
	}
}

/**
 * Basic fallback extraction for simple transaction mentions
 */
export function fallbackExtraction(text: string, todayDate: string): Transaction[] {
	console.log('[fallbackExtraction] Attempting extraction for:', text);

	try {
		// 1) Lowercase everything for simpler matching
		const lowerText = text.toLowerCase();

		// 2) Attempt to parse amount
		//    Here we handle either “$1.00,” “$1,” “1.00,” or “spent a dollar,” “spent 2 bucks,” etc.
		//    For example:
		//    - “(\d+(?:\.\d+)?)\s*(?:buck|bucks|dollar|dollars|usd|...)”
		//    - or “spent a dollar”
		let amount = 0;

		// Regex #1: e.g. “spent a dollar,” “spent 3 bucks”
		// We'll search for something like “spent (a )?(\d+)?(buck(s)?|dollar(s)?)”
		// But “spent a dollar” => we interpret “a” as 1.0
		const spentDollarMatch = lowerText.match(
			/\bspent\s+(?:a\s+)?(\d+)?\s*(buck|bucks|dollar|dollars)\b/
		);
		if (spentDollarMatch) {
			// If user said “spent a dollar,” spentDollarMatch[1] might be undefined
			// If user said “spent 3 bucks,” spentDollarMatch[1] would be “3”
			if (!spentDollarMatch[1]) {
				amount = 1; // “a dollar” => 1
			} else {
				amount = parseFloat(spentDollarMatch[1]);
			}
		}

		// If not found or still 0, check for normal currency patterns:
		if (amount === 0) {
			// “$1.00”, “$1”, “1.00”, or “1.50 dollars”, etc.
			const currencyMatch = text.match(
				/\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:bucks?|dollars?|usd))?\b/i
			);
			if (currencyMatch) {
				const amtStr = currencyMatch[1].replace(/[,]/g, '');
				amount = parseFloat(amtStr);
			}
		}

		// 3) Figure out direction (in/out)
		//    If user used words like “spent,” “paid,” “bought,” => direction = out
		//    If user used words like “received,” “earned,” => direction = in
		let direction: 'in' | 'out' | 'unknown' = 'unknown';
		if (/\b(spent|paid|bought|purchased|cost|expense|debit)\b/i.test(lowerText)) {
			direction = 'out';
		} else if (/\b(received|got|earned|income|payment|credit)\b/i.test(lowerText)) {
			direction = 'in';
		}

		// 4) Extract description (still your existing logic, e.g. “cookies at Target”)
		let description = 'unknown';
		const prepositions = ['at', 'on', 'for', 'from', 'in'];
		for (const prep of prepositions) {
			// e.g. “\b at (.*?)\b”
			const regex = new RegExp(
				`\\b${prep}\\s+(.+?)(?:\\s+(?:yesterday|today|last|on|at|for|from|in)|$)`,
				'i'
			);
			const match = lowerText.match(regex);
			if (match && match[1] && match[1].length > 2) {
				description = match[1].trim();
				break;
			}
		}

		// If still unknown, do your fallback approach
		if (description === 'unknown') {
			// Or parse next words after “on,” “spent,” etc. It’s up to you how you handle it
		}

		// 5) Figure out date
		//    If user says “today,” we store todayDate. If “yesterday,” we do minus 1 day, etc.
		//    For brevity, let’s do a naive check:
		let date = todayDate;
		if (/\byesterday\b/i.test(lowerText)) {
			const yesterday = new Date(todayDate);
			yesterday.setDate(yesterday.getDate() - 1);
			date = yesterday.toISOString().split('T')[0];
		} else if (/\btoday\b/i.test(lowerText)) {
			date = todayDate;
		}
		// Add more logic if needed: “last monday,” etc.

		// 6) If we have at least an amount > 0 and direction != unknown, create transaction
		if (amount > 0 && direction !== 'unknown') {
			const category = direction === 'out' ? 'Expenses' : 'Other / Uncategorized';

			const transaction: Transaction = {
				id: generateTransactionId(),
				date: date,
				description: description,
				type: direction === 'out' ? 'Card' : 'Other',
				amount: amount,
				category: category,
				notes: '',
				direction
			};
			console.log('[fallbackExtraction] Created transaction:', transaction);
			return [transaction];
		}

		// 7) If we get here, we found no valid transaction
		console.log('[fallbackExtraction] Could not parse a valid transaction from text:', text);
		return [];
	} catch (err) {
		console.error('[fallbackExtraction] Error in fallback extraction:', err);
		return [];
	}
}
/**
 * Parses transactions from a raw LLM JSON response string.
 */
export function parseTransactionsFromLLMResponse(jsonString: string): Transaction[] {
	console.log(
		'[parseTransactionsFromLLMResponse] Attempting to parse JSON:',
		jsonString.substring(0, 200) + '...'
	);
	try {
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
				try {
					JSON.parse(potentialArray);
					potentialJson = `{ "transactions": ${potentialArray} }`;
				} catch (e) {
					potentialJson = '';
				}
			} else {
				potentialJson = '';
			}
		}

		if (!potentialJson) return [];

		let parsedData;
		try {
			parsedData = JSON.parse(potentialJson);
		} catch (e) {
			try {
				const fixedJson = fixCommonJsonErrors(potentialJson);
				parsedData = JSON.parse(fixedJson);
			} catch (e2) {
				console.error('Error parsing JSON even after fixes:', e2);
				return [];
			}
		}

		if (parsedData && parsedData.transactions && Array.isArray(parsedData.transactions)) {
			return convertLLMTransactionsToAppFormat(parsedData.transactions);
		} else {
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
	// Fix trailing commas
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');
	// Fix missing quotes around keys
	fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
	// Add more fixes if needed
	return fixed;
}

/**
 * Interface for LLM-extracted transaction data
 */
interface LLMTransactionData {
	date: string;
	description: string;
	details?: string;
	type: string;
	amount: number | string;
	direction: 'IN' | 'OUT' | 'UNKNOWN';
}

/**
 * Converts LLM transaction data structure to the application's Transaction type.
 */
function convertLLMTransactionsToAppFormat(llmTransactions: any[]): Transaction[] {
	return llmTransactions
		.map((txn: any, index: number): Transaction | null => {
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

			let amountValue: number = 0;
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

			const transactionObject: Transaction = {
				id: generateTransactionId() + index,
				date: date,
				description: description,
				type: type,
				amount: amountValue,
				category: category,
				notes: details,
				direction: direction
			};

			// Basic check before returning
			if (
				transactionObject.amount === 0 &&
				(transactionObject.description === 'unknown' || transactionObject.description === '')
			) {
				return null; // Return null for completely empty transactions
			}
			return transactionObject;
		})
		.filter((t): t is Transaction => t !== null);
}
