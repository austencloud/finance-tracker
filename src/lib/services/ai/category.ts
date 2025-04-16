// src/lib/services/ai/category.ts

import { getCategorySuggestionPrompt } from './prompts';
// --- UPDATED IMPORT ---
import { llmChat, getLLMFallbackResponse } from './llm'; // Use abstraction layer
// --- END UPDATE ---
import type { Category, Transaction } from '$lib/stores/types';

/**
 * Suggests a category for a given transaction using the configured LLM.
 * @param transaction - The transaction details.
 * @param availableCategories - The list of valid categories.
 * @returns A suggested category name (or fallback).
 */
export async function suggestCategory(
	transaction: Transaction,
	availableCategories: readonly Category[] // Accept readonly array
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
		// Create the prompt using the helper function
		const prompt = getCategorySuggestionPrompt(transaction, availableCategories);
		// Prepare messages for the chat endpoint
		const messages = [{ role: 'user' as const, content: prompt }];

		// --- UPDATED CALL ---
		// Use llmChat as the prompt asks for a single category name (not necessarily JSON)
		const response = await llmChat(messages, {
			temperature: 0.1,
			rawUserText: transaction.description
		});
		// --- END UPDATE ---

		const suggestedCategory = response?.trim();

		// Validate the suggestion against the available categories
		if (suggestedCategory && availableCategories.includes(suggestedCategory as Category)) {
			return suggestedCategory as Category;
		} else {
			console.warn(
				`[suggestCategory] LLM suggestion "${suggestedCategory}" not in available categories [${availableCategories.join(', ')}] or response empty. Falling back.`
			);
			return fallbackCategory; // Fallback if suggestion is invalid or empty
		}
	} catch (error) {
		console.error('[suggestCategory] Error during LLM call or processing:', error);
		// Log the specific error using the abstracted fallback response function
		console.error(`[suggestCategory] Fallback Error Message: ${getLLMFallbackResponse(error)}`);
		return fallbackCategory; // Fallback on any error
	}
}
