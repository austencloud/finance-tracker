// src/utils/llm.ts
import type { Transaction, Category } from '../types';
import { categories } from '../store';
import { generateTransactionId } from './helpers';
import { categorizeTransaction } from './categorizer';
import { extractTransactionsFromText } from './llm-transaction-parser';

/**
 * Process transaction data using a local LLM
 * @param text Raw transaction text
 * @returns Array of parsed transactions
 */
export async function processWithLLM(text: string): Promise<Transaction[]> {
	try {
		// Use the parser from the modularized system
		return await extractTransactionsFromText(text);
	} catch (error) {
		console.error('Error processing with LLM:', error);
		throw error;
	}
}

/**
 * Recategorize a single transaction using LLM
 * @param transaction Transaction to categorize
 * @returns Suggested category
 */
export async function suggestCategory(transaction: Transaction): Promise<Category> {
	try {
		const prompt = `
    You are a financial transaction categorizer. Based on the transaction details below, suggest the most appropriate category from this list: ${categories.join(', ')}.
    
    Transaction:
    Date: ${transaction.date}
    Description: ${transaction.description}
    Type: ${transaction.type}
    Amount: $${transaction.amount}
    
    Consider common patterns:
    - PayPal transfers often involve "PAYPAL" in the description
    - Business income for Austen Cloud Performance may include client names like "KAREN M BURRIS", "FULL MOON JAM FOUNDATION", "PYROTECHNIQ", "ROBERT G BERSHADSKY"
    - Crypto sales usually mention "Coinbase" or "COINBASE"
    - Non-taxable research may mention "Open Research" or "YC RESEARCH"
    - Insect Asylum work will include "THE INSECT ASYLUM INC."
    - Card transactions are typically expenses
    
    Respond with just the category name, nothing else.
    `;

		const response = await fetch('http://localhost:11434/api/generate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'llama3',
				prompt: prompt,
				stream: false
			})
		});

		if (!response.ok) {
			throw new Error(`LLM API error: ${response.status}`);
		}

		const data = await response.json();
		const suggestedCategory = data.response.trim();

		// Validate that the suggested category is in our list
		if (categories.includes(suggestedCategory as Category)) {
			return suggestedCategory as Category;
		} else {
			// Default to the original category if not found
			return transaction.category;
		}
	} catch (error) {
		console.error('Error suggesting category:', error);
		return transaction.category;
	}
}

/**
 * Check if the local LLM server is available
 * @returns Promise that resolves to boolean indicating availability
 */
export async function isLLMAvailable(): Promise<boolean> {
	try {
		const response = await fetch('http://localhost:11434/api/tags', {
			method: 'GET'
		});
		return response.ok;
	} catch (error) {
		return false;
	}
}

// Re-export the conversation functions for ease of use
export * from './llm-conversation-manager';
