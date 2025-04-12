// src/lib/services/ai/extraction.ts
import type { Transaction } from '$lib/types';
import { generateTransactionId } from '$lib/utils/helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '../categorizer';
import { ollamaGenerateJson } from './llm-client';
import { getExtractionPrompt } from './prompts';

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
function fallbackExtraction(text: string, todayDate: string): Transaction[] {
	console.log('[fallbackExtraction] Attempting basic extraction for:', text);

	try {
		const lowerText = text.toLowerCase();

		// Extract amount
		const amountMatch = text.match(/\$\s*(\d+(?:\.\d+)?)/);
		let amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

		if (amount === 0) {
			const numericMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:dollar|usd|bucks|cents)\b/i);
			if (numericMatch) {
				amount = parseFloat(numericMatch[1]);
			}
		}

		// Determine if this is spent (out) or received (in)
		let direction: 'in' | 'out' | 'unknown' = 'unknown';
		if (/\b(?:spent|paid|bought|purchased|cost|expense|debit)\b/i.test(lowerText)) {
			direction = 'out';
		} else if (/\b(?:received|got|earned|income|payment|credit)\b/i.test(lowerText)) {
			direction = 'in';
		}

		// Extract description (what was bought/received)
		let description = 'unknown';
		const prepositions = ['at', 'on', 'for', 'from'];

		for (const prep of prepositions) {
			const regex = new RegExp(
				`\\b${prep}\\s+(.+?)(?:\\s+(?:yesterday|yester|today|last|on|at|for|from)|$)`,
				'i'
			);
			const match = lowerText.match(regex);
			if (match && match[1] && match[1].length > 2) {
				description = match[1].trim();
				break;
			}
		}

		// Try to get location if we didn't find a description
		if (description === 'unknown') {
			// Look for words after at/from/in
			const locationMatch = lowerText.match(/\b(?:at|from|in)\s+([a-z0-9\s']+)(?:\s+|$)/i);
			if (locationMatch && locationMatch[1] && locationMatch[1].length > 2) {
				description = locationMatch[1].trim();
			} else {
				// Just use the first noun phrase we can find
				const words = lowerText.split(/\s+/);
				const skipWords = [
					'i',
					'spent',
					'paid',
					'bought',
					'got',
					'received',
					'please',
					'add',
					'it',
					'my',
					'the',
					'a',
					'an'
				];

				for (const word of words) {
					if (word.length > 3 && !skipWords.includes(word) && !/^\d+$/.test(word)) {
						description = word;
						break;
					}
				}
			}
		}

		// Extract date
		let date = todayDate;
		if (/\byesterday\b|\byester\b/i.test(lowerText)) {
			const yesterday = new Date(todayDate);
			yesterday.setDate(yesterday.getDate() - 1);
			date = yesterday.toISOString().split('T')[0];
		} else if (/\btoday\b/i.test(lowerText)) {
			date = todayDate;
		} else if (/\blast\s+week\b/i.test(lowerText)) {
			const lastWeek = new Date(todayDate);
			lastWeek.setDate(lastWeek.getDate() - 7);
			date = lastWeek.toISOString().split('T')[0];
		}

		// If we have at least an amount and a direction, create a transaction
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
				direction: direction
			};

			console.log('[fallbackExtraction] Created transaction:', transaction);
			return [transaction];
		}

		return [];
	} catch (error) {
		console.error('[fallbackExtraction] Error in fallback extraction:', error);
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
