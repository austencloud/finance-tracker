// src/lib/services/ai/extraction/orchestrator.ts

import { getExtractionPrompt, getOptimizedExtractionPrompt } from '../prompts';
// Ensure local extractors are imported
import { enhancedLocalExtraction } from './local-extractors';
import { parseTransactionsFromLLMResponse } from './llm-parser';
import type { Transaction } from '$lib/types/types';
import { v4 as uuidv4 } from 'uuid'; // <-- Import uuid
import { llmGenerateJson } from '../llm-helpers';
import { isOllamaAvailable } from '../ollama-client';

// Cache remains the same
const extractionCache = new Map<string, { timestamp: number; data: Transaction[] }>();
const CACHE_DURATION = 5 * 60 * 1000;

/**
 * Orchestrates the extraction of structured transaction data from raw text.
 * Includes batchId generation.
 */
export async function extractTransactionsFromText(text: string): Promise<Transaction[]> {
	const cacheKey = text.substring(0, 200);
	const cached = extractionCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
		console.log('[Orchestrator] Using cached extraction results');
		return [...cached.data];
	}

	console.log('[Orchestrator] Extracting from:', text.substring(0, 100) + '...');
	const today = new Date().toISOString().split('T')[0];
	// --- Generate a single batchId for this extraction attempt ---
	const batchId = uuidv4();
	console.log(`[Orchestrator] Generated batchId: ${batchId}`);
	let result: Transaction[] = [];

	// --- Strategy 1 & 3 Combined: Enhanced Local Extraction ---
	// Try local methods first as they are faster and cheaper
	console.log('[Orchestrator] Attempting enhanced local extraction...');
	try {
		// --- Pass batchId to local extractor ---
		result = enhancedLocalExtraction(text, today, batchId);
		if (result.length > 0) {
			console.log(`[Orchestrator] Local extraction successful (${result.length} txns).`);
			extractionCache.set(cacheKey, { timestamp: Date.now(), data: [...result] });
			return result;
		}
		console.log('[Orchestrator] Local extraction found no transactions.');
	} catch (error) {
		console.error('[Orchestrator] Error in local extraction:', error);
		// Proceed to LLM if local fails
	}

	// --- Strategy 2: LLM API Extraction Fallback ---
	if (result.length === 0) {
		// Only try LLM if local methods found nothing
		const llmCouldBeAvailable = await isOllamaAvailable();
		if (llmCouldBeAvailable && text.length > 0 && text.length <= 15000) {
			console.log('[Orchestrator] Attempting LLM extraction...');
			try {
				const looksLikeStatement =
					/^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[0-1]?[0-9]\/[0-3]?[0-9]\/\d{2,4})/m.test(
						text.substring(0, 500)
					);
				const extractionPrompt = looksLikeStatement
					? getOptimizedExtractionPrompt(text, today)
					: getExtractionPrompt(text, today);

				const rawJsonResponse = await llmGenerateJson([
					{ role: 'user', content: extractionPrompt }
				]);
				if (rawJsonResponse) {
					// --- Pass batchId to LLM parser ---
					result = parseTransactionsFromLLMResponse(rawJsonResponse, batchId); // <-- Pass batchId here
					console.log(
						`[Orchestrator] LLM extraction successful (${result.length} txns after parsing/validation).`
					);
				} else {
					console.warn('[Orchestrator] LLM returned empty response.');
					result = [];
				}
			} catch (error) {
				console.error('[Orchestrator] LLM API extraction error:', error);
				result = []; // Ensure result is empty on LLM error
			}
		} else if (!llmCouldBeAvailable) {
			console.log('[Orchestrator] LLM not available, skipping API call.');
		} else {
			console.log('[Orchestrator] Text too large or empty for LLM API.');
		}
	}

	// Cache the final result (even if empty or from local extraction failure)
	extractionCache.set(cacheKey, { timestamp: Date.now(), data: [...result] });
	console.log(`[Orchestrator] Final result: ${result.length} transactions.`);
	return result;
}
