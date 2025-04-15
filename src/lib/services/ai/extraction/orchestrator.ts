// src/lib/services/ai/extraction/orchestrator.ts
import type { Transaction } from '$lib/types/transactionTypes';
import { deepseekGenerateJson, isLLMAvailable } from '../deepseek-client';
import { getExtractionPrompt, getOptimizedExtractionPrompt } from '../prompts';
import { enhancedLocalExtraction, extractBankStatementFormat } from './local-extractors';
import { parseTransactionsFromLLMResponse } from './llm-parser';

// Simple cache (consider more robust caching if needed)
const extractionCache = new Map<string, { timestamp: number; data: Transaction[] }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Orchestrates the extraction of structured transaction data from raw text.
 * Prioritizes local methods, falls back to LLM API (with JSON mode and Zod validation).
 * Includes basic caching.
 *
 * @param text The raw text potentially containing transaction data.
 * @returns A promise resolving to an array of extracted transactions.
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	const cacheKey = text.substring(0, 200); // Use a slightly longer key

	// Check cache
	const cached = extractionCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
		console.log('[Orchestrator] Using cached extraction results');
		return [...cached.data]; // Return copy
	}

	console.log('[Orchestrator] Extracting from:', text.substring(0, 100) + '...');
	const today = new Date().toISOString().split('T')[0];
	let result: Transaction[] = [];

	// --- Strategy 1: Optimized Local Extraction for Bank Statements ---
	try {
		const bankTransactions = extractBankStatementFormat(text);
		if (bankTransactions.length > 0) {
			console.log(
				`[Orchestrator] Local bank statement extraction successful (${bankTransactions.length} txns).`
			);
			result = bankTransactions;
			extractionCache.set(cacheKey, { timestamp: Date.now(), data: [...result] });
			return result;
		}
		console.log('[Orchestrator] Local bank statement extraction found no transactions.');
	} catch (error) {
		console.error('[Orchestrator] Error in local bank statement extraction:', error);
	}

	// --- Strategy 2: LLM API Extraction (if available and text size reasonable) ---
	const llmCouldBeAvailable = await isLLMAvailable(); // Check once
	// Adjusted limit based on API/prompt considerations
	if (llmCouldBeAvailable && text.length > 0 && text.length <= 15000) {
		console.log('[Orchestrator] Attempting LLM extraction...');
		try {
			// Determine prompt type (optional refinement)
			const looksLikeStatement =
				/^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[0-1]?[0-9]\/[0-3]?[0-9]\/\d{2,4})/m.test(
					text.substring(0, 500)
				);
			const extractionPrompt = looksLikeStatement
				? getOptimizedExtractionPrompt(text, today)
				: getExtractionPrompt(text, today);

			const rawJsonResponse = await deepseekGenerateJson(extractionPrompt); // Uses JSON mode
			if (rawJsonResponse) {
				result = parseTransactionsFromLLMResponse(rawJsonResponse); // Uses Zod validation
				console.log(
					`[Orchestrator] LLM extraction successful (${result.length} txns after parsing/validation).`
				);
			} else {
				console.warn('[Orchestrator] LLM returned empty response.');
				result = [];
			}

			// Use LLM result only if it found something valid
			if (result.length > 0) {
				extractionCache.set(cacheKey, { timestamp: Date.now(), data: [...result] });
				return result;
			} else {
				console.log('[Orchestrator] LLM extraction yielded no valid transactions.');
			}
		} catch (error) {
			console.error('[Orchestrator] LLM API extraction error:', error);
			// Fall through to general local extraction if API fails
		}
	} else if (!llmCouldBeAvailable) {
		console.log('[Orchestrator] LLM not available, skipping API call.');
	} else {
		console.log('[Orchestrator] Text too large or empty for LLM API, relying on local extraction.');
	}

	// --- Strategy 3: Fallback to Enhanced General Local Extraction ---
	if (result.length === 0) {
		console.log('[Orchestrator] Falling back to enhanced general local extraction.');
		try {
			result = enhancedLocalExtraction(text, today);
			console.log(`[Orchestrator] Enhanced local extraction found ${result.length} transactions.`);
		} catch (error) {
			console.error('[Orchestrator] Error in enhanced local extraction:', error);
			result = []; // Ensure result is an empty array on error
		}
	}

	// Cache the final result (even if empty)
	extractionCache.set(cacheKey, { timestamp: Date.now(), data: [...result] });
	console.log(`[Orchestrator] Final result: ${result.length} transactions.`);
	return result;
}
