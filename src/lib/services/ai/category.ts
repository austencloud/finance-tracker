// src/lib/services/ai/category.ts
import type { Transaction, Category } from '$lib/types';
import { categories } from '$lib/stores/transactionStore';
import { getCategorySuggestionPrompt } from './prompts';
import { ollamaGenerateJson } from './llm-client';

/**
 * Suggest a category for a transaction using LLM
 * @param transaction Transaction to categorize
 * @returns Suggested category
 */
export async function suggestCategory(transaction: Transaction): Promise<Category> {
	try {
		const prompt = getCategorySuggestionPrompt(transaction, categories);

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
