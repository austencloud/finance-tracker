// src/lib/services/ai/extraction/orchestrator.ts
import type { Transaction } from '$lib/types';
import { deepseekGenerateJson } from '../deepseek-client';
import { getExtractionPrompt, getOptimizedExtractionPrompt } from '../prompts'; // Assuming getOptimizedExtractionPrompt is moved here or kept in prompts.ts
import { enhancedLocalExtraction, extractBankStatementFormat } from './local-extractors';
import { parseTransactionsFromLLMResponse } from './llm-parser';

// Cache for extraction results to avoid redundant processing/API calls
const extractionCache = new Map<string, Transaction[]>();

/**
 * Orchestrates the extraction of structured transaction data from raw text.
 * It prioritizes local extraction methods and falls back to the LLM API if necessary.
 * Results are cached based on the input text.
 *
 * @param text The raw text potentially containing transaction data.
 * @returns A promise resolving to an array of extracted transactions.
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	// Generate a simple cache key (consider a more robust hash for production)
	const cacheKey = text.substring(0, 100);

	// Check cache first
	if (extractionCache.has(cacheKey)) {
		console.log('[extractTransactionsFromText - Orchestrator] Using cached results');
		// Return a copy to prevent accidental modification of the cached array
		return [...(extractionCache.get(cacheKey) || [])];
	}

	console.log(
		'[extractTransactionsFromText - Orchestrator] Extracting from:',
		text.substring(0, 100) + '...'
	);
	const today = new Date().toISOString().split('T')[0];
	let result: Transaction[] = [];

	// --- Strategy 1: Optimized Local Extraction for Bank Statements ---
	// This is faster and often more reliable for known formats.
	try {
		// Use the specific bank statement extractor first
		const bankTransactions = extractBankStatementFormat(text);
		if (bankTransactions.length > 0) {
			console.log(
				`[extractTransactionsFromText - Orchestrator] Local bank statement extraction found ${bankTransactions.length} transactions`
			);
			result = bankTransactions;
			extractionCache.set(cacheKey, [...result]); // Cache the result
			return result;
		}
		console.log(
			'[extractTransactionsFromText - Orchestrator] Local bank statement extraction found no transactions, proceeding...'
		);
	} catch (error) {
		console.error(
			'[extractTransactionsFromText - Orchestrator] Error in local bank statement extraction:',
			error
		);
		// Continue even if local extraction fails
	}

	// --- Strategy 2: LLM API Extraction (if text is reasonably sized) ---
	// Use the API for more complex or unstructured text.
	if (text.length <= 12000) {
		// Adjusted limit based on prompt example
		try {
			// Use the optimized prompt if it seems like a bank statement, otherwise use the general one
			// Note: You might refine the condition for using the optimized prompt
			const looksLikeStatement =
				/^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[0-1]?[0-9]\/[0-3]?[0-9]\/\d{2,4})/m.test(
					text.substring(0, 500)
				);
			const extractionPrompt = looksLikeStatement
				? getOptimizedExtractionPrompt(text, today) // Use the specific prompt for statements
				: getExtractionPrompt(text, today); // Use the general prompt otherwise
                console.log('[extractTransactionsFromText - Orchestrator] Generated Extraction Prompt:', extractionPrompt);
			console.log(
				`[extractTransactionsFromText - Orchestrator] Using ${looksLikeStatement ? 'optimized' : 'general'} extraction prompt for API call.`
			);
			const rawJsonResponse = await deepseekGenerateJson(extractionPrompt);
			console.log('[extractTransactionsFromText - Orchestrator] Raw LLM response received.');
            console.log('[extractTransactionsFromText - Orchestrator] Raw JSON Response:', rawJsonResponse);
			const parsedTransactions = parseTransactionsFromLLMResponse(rawJsonResponse);
			console.log(
				`[extractTransactionsFromText - Orchestrator] Parsed ${parsedTransactions.length} transactions from LLM.`
			);

			// Validate API results: Use them only if they seem valid (e.g., contain amounts)
			// Ensure amount is treated as a number for comparison
			if (parsedTransactions.length > 0 && parsedTransactions.some((t) => Number(t.amount) > 0)) {
				const validTransactions = parsedTransactions.filter((t) => Number(t.amount) > 0);
				console.log(
					`[extractTransactionsFromText - Orchestrator] ${validTransactions.length} valid transactions from API after filtering.`
				);
				result = validTransactions;
				extractionCache.set(cacheKey, [...result]); // Cache the result
				return result;
			} else {
				console.log(
					'[extractTransactionsFromText - Orchestrator] No valid transactions from API or amounts are zero.'
				);
			}
		} catch (error) {
			console.error(
				'[extractTransactionsFromText - Orchestrator] LLM API extraction error:',
				error
			);
			// Fall through to general local extraction if API fails
		}
	} else {
		console.log(
			'[extractTransactionsFromText - Orchestrator] Text too large for API, relying solely on local extraction.'
		);
	}

	// --- Strategy 3: Fallback to Enhanced General Local Extraction ---
	// If API wasn't used, failed, or returned unusable results, try the general local methods.
	if (result.length === 0) {
		console.log(
			'[extractTransactionsFromText - Orchestrator] Falling back to enhanced general local extraction.'
		);
		try {
			result = enhancedLocalExtraction(text, today);
			console.log(
				`[extractTransactionsFromText - Orchestrator] Enhanced local extraction found ${result.length} transactions.`
			);
		} catch (error) {
			console.error(
				'[extractTransactionsFromText - Orchestrator] Error in enhanced local extraction:',
				error
			);
			result = []; // Ensure result is an empty array on error
		}
	}

	// Cache the final result (even if empty)
	extractionCache.set(cacheKey, [...result]);
	return result;
}
