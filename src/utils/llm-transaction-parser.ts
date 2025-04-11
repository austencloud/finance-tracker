// src/utils/llm-transaction-parser.ts
import type { Transaction, Category } from '../types';
import { generateTransactionId } from './helpers';
import { categorizeTransaction } from './categorizer';
import { getExtractionPrompt } from './llm-prompts';

/**
 * Interface for LLM-extracted transaction data
 */
export interface LLMTransactionData {
	date: string;
	description: string;
	details?: string;
	type: string;
	amount: number | string;
	direction: 'IN' | 'OUT';
}

/**
 * Extract transactions from text using the LLM
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	try {
		const extractionPrompt = getExtractionPrompt(text);

		// Send extraction request to the LLM
		const response = await fetch('http://localhost:11434/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'llama3',
				prompt: extractionPrompt,
				stream: false
			})
		});

		if (!response.ok) {
			throw new Error(`LLM API error: ${response.status}`);
		}

		const data = await response.json();
		const content = data.response;

		// Extract JSON from the response using multiple methods
		return parseTransactionsFromLLMResponse(content);
	} catch (error) {
		console.error('Error extracting transactions:', error);
		return [];
	}
}

/**
 * Parse transactions from an LLM response
 */
export function parseTransactionsFromLLMResponse(content: string): Transaction[] {
	try {
		// Try multiple JSON extraction methods
		const jsonMatch =
			content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/({[\s\S]*?})/);

		if (!jsonMatch) {
			console.warn('No JSON found in LLM response');
			return [];
		}

		// Parse the JSON content
		const jsonContent = jsonMatch[1].trim();
		let parsedData;

		try {
			parsedData = JSON.parse(jsonContent);
		} catch (e) {
			// Try to fix common JSON issues
			const fixedJson = fixCommonJsonErrors(jsonContent);
			try {
				parsedData = JSON.parse(fixedJson);
			} catch (e2) {
				console.error('Error parsing JSON after attempted fixes:', e2);
				return [];
			}
		}

		// Extract transactions array
		if (!parsedData.transactions || !Array.isArray(parsedData.transactions)) {
			console.warn('No transactions array found in parsed data');
			return [];
		}

		// Convert to our application's transaction format
		return convertLLMTransactionsToAppFormat(parsedData.transactions);
	} catch (error) {
		console.error('Error parsing transactions from LLM response:', error);
		return [];
	}
}

/**
 * Convert LLM transaction data to our application's format
 */
export function convertLLMTransactionsToAppFormat(
	llmTransactions: LLMTransactionData[]
): Transaction[] {
	return llmTransactions.map((txn) => {
		// Convert amount string to number if needed
		let amountValue =
			typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/[$,]/g, '')) : txn.amount;

		// Default to expenses for non-specified values
		if (isNaN(amountValue)) amountValue = 0;

		// Determine category based on direction
		const isExpense = txn.direction === 'OUT';
		const defaultCategory: Category = isExpense ? 'Expenses' : 'Other / Uncategorized';

		// Use our existing categorizer but override if direction indicates income
		let category = categorizeTransaction(txn.description, txn.type);
		if (!isExpense && category === 'Expenses') {
			category = 'Other / Uncategorized';
		}

		// Create notes from details if available
		const notes = txn.details ? txn.details : '';

		// Map direction, defaulting to 'unknown'
		let direction: 'in' | 'out' | 'unknown' = 'unknown';
		if (txn.direction === 'IN') {
			direction = 'in';
		} else if (txn.direction === 'OUT') {
			direction = 'out';
		}

		return {
			id: generateTransactionId(),
			date: txn.date || 'unknown',
			description: txn.description || '',
			type: txn.type || 'Other',
			amount: amountValue,
			category,
			notes,
			direction
		};
	});
}

/**
 * Fix common JSON errors in LLM responses
 */
function fixCommonJsonErrors(jsonStr: string): string {
	let fixed = jsonStr;

	// Fix missing quotes around property names
	fixed = fixed.replace(/(\s*)([a-zA-Z0-9_]+)(\s*):(\s*)/g, '$1"$2"$3:$4');

	// Fix trailing commas in arrays/objects
	fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

	// Fix missing commas between array elements
	fixed = fixed.replace(/}(\s*){/g, '},$1{');

	// Fix single quotes used instead of double quotes
	fixed = fixed.replace(/'/g, '"');

	return fixed;
}

/**
 * Extract a single transaction from a simple message
 * Used for quick extraction from conversational messages
 */
export async function extractTransactionFromMessage(message: string): Promise<Transaction[]> {
	// Quick check if the message might contain transaction data
	if (message.includes('$') || /\d+\s*dollars/i.test(message)) {
		return extractTransactionsFromText(message);
	}
	return [];
}
