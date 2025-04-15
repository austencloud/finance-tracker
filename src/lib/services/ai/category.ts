// src/lib/services/ai/category.ts

import { getCategorySuggestionPrompt } from './prompts';
import { deepseekChat } from './deepseek-client';
import type { Category, Transaction } from '$lib/stores/types'; // Corrected import path

export async function suggestCategory(
	transaction: Transaction,
	availableCategories: Category[] // <-- ADD argument for categories
): Promise<Category> {
	// Default to the transaction's current category in case of errors or no suggestion
	const fallbackCategory = transaction.category || 'Other / Uncategorized';

	if (!transaction) {
		console.warn('[suggestCategory] No transaction provided.');
		return fallbackCategory;
	}
	if (!Array.isArray(availableCategories) || availableCategories.length === 0) {
		console.warn('[suggestCategory] No available categories provided.');
		return fallbackCategory;
	}

	try {
		// Use the passed-in availableCategories
		const prompt = getCategorySuggestionPrompt(transaction, availableCategories);

		const messages = [{ role: 'user', content: prompt }];
		const response = await deepseekChat(messages); // Assuming deepseekChat handles its own errors

		const suggestedCategory = response?.trim();

		// Validate against the passed-in availableCategories
		if (suggestedCategory && availableCategories.includes(suggestedCategory as Category)) {
			return suggestedCategory as Category;
		} else {
			console.warn(
				`[suggestCategory] LLM suggestion "${suggestedCategory}" not in available categories or response empty. Falling back.`
			);
			return fallbackCategory; // Fallback if suggestion is invalid or empty
		}
	} catch (error) {
		console.error('[suggestCategory] Error during API call or processing:', error);
		return fallbackCategory; // Fallback on error
	}
}