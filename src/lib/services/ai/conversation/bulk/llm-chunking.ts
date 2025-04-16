// src/lib/services/ai/conversation/bulk/llm-chunking.ts

// --- UPDATED IMPORT ---
// --- END UPDATE ---
import { fixCommonJsonErrors } from '../../extraction/llm-parser'; // Keep JSON fixing helper
import { getLLMFallbackResponse, llmGenerateJson } from '../../llm';

/**
 * Creates a prompt asking the LLM to split raw text into transaction chunks.
 * @param text Raw input text, potentially containing multiple transactions.
 * @returns The prompt string.
 */
function getLlmChunkingPrompt(text: string): string {
	// Limit text sent to LLM if necessary, although models handle larger contexts now
	const MAX_CHUNK_PROMPT_LENGTH = 15000; // Adjust based on model limits and typical input size
	const truncatedText =
		text.length > MAX_CHUNK_PROMPT_LENGTH
			? text.substring(0, MAX_CHUNK_PROMPT_LENGTH) + '\n... (truncated)'
			: text;

	// Prompt remains the same, asking for specific JSON output
	return `Analyze the following text... [Your existing detailed prompt asking for {"transaction_chunks": [...]} JSON] ...CRITICAL INSTRUCTION: Your response MUST BEGIN IMMEDIATELY with the opening brace '{'...`;
}

/**
 * Uses the configured LLM via the abstraction layer to split raw text into potential transaction chunks.
 * @param text The raw input text.
 * @returns A promise resolving to an array of string chunks, or an empty array on failure.
 */
export async function llmChunkTransactions(text: string): Promise<string[]> {
	console.log('[llmChunkTransactions] Requesting LLM to chunk transaction data...');
	if (!text || text.trim().length === 0) {
		return [];
	}

	const prompt = getLlmChunkingPrompt(text);

	try {
		// --- UPDATED CALL ---
		// Use llmGenerateJson as the prompt specifically requests JSON output
		const jsonResponse = await llmGenerateJson(prompt);
		// --- END UPDATE ---

		console.log('[llmChunkTransactions] Received raw response from LLM for chunking.');

		// Attempt to parse the JSON robustly (keep existing logic)
		let parsedData: any = null;
		try {
			parsedData = JSON.parse(jsonResponse);
		} catch (e) {
			console.warn('[llmChunkTransactions] Initial JSON parse failed, attempting to fix...');
			try {
				const fixedJson = fixCommonJsonErrors(jsonResponse);
				parsedData = JSON.parse(fixedJson);
				console.log('[llmChunkTransactions] Parsed successfully after fixing JSON.');
			} catch (fixError) {
				console.error('[llmChunkTransactions] Failed to parse JSON even after fixing:', fixError);
				console.error('[llmChunkTransactions] Original problematic JSON string:', jsonResponse);
				return []; // Return empty array if parsing fails definitively
			}
		}

		// Validate the parsed structure (keep existing logic)
		if (parsedData && Array.isArray(parsedData.transaction_chunks)) {
			const chunks = parsedData.transaction_chunks.filter(
				(chunk: any): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0
			);
			console.log(
				`[llmChunkTransactions] Extracted ${chunks.length} valid chunks from LLM response.`
			);
			return chunks;
		} else {
			console.warn(
				'[llmChunkTransactions] LLM response did not contain a valid "transaction_chunks" array. Response:',
				parsedData
			);
			return [];
		}
	} catch (error) {
		console.error('[llmChunkTransactions] Error calling LLM API for chunking:', error);
		// Use abstracted fallback for logging if desired
		console.error(
			`[llmChunkTransactions] Fallback Error Message: ${getLLMFallbackResponse(error)}`
		);
		return []; // Return empty array on API error
	}
}

// Keep fixCommonJsonErrors if it's defined here, or ensure it's imported correctly
// function fixCommonJsonErrors(jsonStr: string): string { /* ... */ }
