// src/utils/llm-transaction-parser.ts
import type { Transaction, Category } from '../types';
import { generateTransactionId } from './helpers';
import { categorizeTransaction } from './categorizer';
// Import specific prompt function
import { getExtractionPrompt } from './llm-prompts';
// Assuming these helpers are defined locally or imported if needed
// function fixCommonJsonErrors(jsonStr: string): string { ... }
// function convertLLMTransactionsToAppFormat(llmTransactions: any[]): Transaction[] { ... }

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
 * (Note: This might be redundant if transaction-extractor.ts is used)
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	try {
        const today = new Date().toISOString().split('T')[0]; // Get today's date
		// *** FIX: Pass today's date ***
		const extractionPrompt = getExtractionPrompt(text, today);

		// Send extraction request to the LLM (using fetch directly or llm-client)
        console.log("[llm-transaction-parser] Simulating call to /api/generate...");
		// const response = await fetch('http://localhost:11434/api/generate', { ... });
        // const data = await response.json();
        // const content = data.response;
        // Example placeholder response:
        let content = '{ "transactions": [] }';
        if (text.includes('$')) {
             content = `{ "transactions": [ {"date": "today", "amount": ${text.match(/\$?(\d+)/)?.[1] || 0}, "description": "unknown", "direction": "OUT"} ] }`;
        }

		// Extract JSON from the response using multiple methods
		return parseTransactionsFromLLMResponse(content); // Assumes this function exists
	} catch (error) {
		console.error('Error extracting transactions:', error);
		return [];
	}
}

/**
 * Parse transactions from an LLM response
 * (Implementation should be consolidated, likely in transaction-extractor.ts)
 */
export function parseTransactionsFromLLMResponse(content: string): Transaction[] {
	console.warn("[llm-transaction-parser] parseTransactionsFromLLMResponse called - Ensure this isn't duplicate logic.");
	try {
		const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/({[\s\S]*?})/);
		if (!jsonMatch) return [];
		const jsonContent = jsonMatch[1].trim();
		let parsedData;
		try {
			parsedData = JSON.parse(jsonContent);
		} catch (e) {
            // Add fixCommonJsonErrors call if that function lives here
			// const fixedJson = fixCommonJsonErrors(jsonContent);
            // parsedData = JSON.parse(fixedJson);
            return []; // Keep it simple for this potentially obsolete file
		}
		if (!parsedData.transactions || !Array.isArray(parsedData.transactions)) return [];
		// Add convertLLMTransactionsToAppFormat call if that function lives here
        // return convertLLMTransactionsToAppFormat(parsedData.transactions);
        // Placeholder return:
        return parsedData.transactions.map((t: any) => ({...t, id: Date.now()})) as Transaction[]; // Basic conversion
	} catch (error) {
		console.error('Error parsing transactions from LLM response:', error);
		return [];
	}
}

/**
 * Convert LLM transaction data to our application's format
 * (Implementation should be consolidated, likely in transaction-extractor.ts)
 */
export function convertLLMTransactionsToAppFormat(llmTransactions: LLMTransactionData[]): Transaction[] {
     console.warn("[llm-transaction-parser] convertLLMTransactionsToAppFormat called - Ensure this isn't duplicate logic.");
     // Placeholder implementation
     return llmTransactions.map(txn => ({
        id: generateTransactionId(),
        date: txn.date || 'unknown',
        description: txn.description || 'unknown',
        type: txn.type || 'Other',
        amount: typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/[$,]/g, '')) : txn.amount || 0,
        category: 'Other / Uncategorized', // Simplified
        notes: txn.details || '',
        direction: txn.direction === 'IN' ? 'in' : (txn.direction === 'OUT' ? 'out' : 'unknown')
     }));
}

/**
 * Fix common JSON errors in LLM responses
 * (Implementation should be consolidated, likely in transaction-extractor.ts)
 */
function fixCommonJsonErrors(jsonStr: string): string {
    console.warn("[llm-transaction-parser] fixCommonJsonErrors called - Ensure this isn't duplicate logic.");
	let fixed = jsonStr;
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');
	return fixed;
}

/**
 * Extract a single transaction from a simple message
 * (Note: This might be redundant if transaction-extractor.ts is used)
 */
export async function extractTransactionFromMessage(message: string): Promise<Transaction[]> {
	if (message.includes('$') || /\d+\s*dollars/i.test(message)) {
		// Calls the potentially redundant extractTransactionsFromText in *this* file
		return extractTransactionsFromText(message);
	}
	return [];
}

