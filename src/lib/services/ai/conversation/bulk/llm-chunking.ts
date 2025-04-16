// src/lib/services/ai/conversation/bulk/llm-chunking.ts
import { deepseekGenerateJson } from '../../deepseek-client';
import { fixCommonJsonErrors } from '../../extraction/llm-parser';

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

	return `Analyze the following text, which likely contains multiple financial transaction records. Your task is to split this text into logical chunks, where each chunk represents a single, complete transaction (typically including date, description, type, and amount lines).

Text to Split:
\`\`\`
${truncatedText}
\`\`\`

Identify the boundaries between individual transactions. Return the result as a JSON object containing a single key "transaction_chunks", which is an array of strings. Each string in the array should be one complete transaction block exactly as it appears in the original text, including all its lines.

Example:
Input Text:
\`\`\`
Jan 12, 2024
Zelle payment from CHRISTINA A VALDES 19564849510
Zelle credit
$197.00

01/12/2024
Zelle payment from TIMOTHY J PEARCE 19563839574
Zelle credit
$75.00
\`\`\`

Output JSON:
\`\`\`json
{
  "transaction_chunks": [
    "Jan 12, 2024\nZelle payment from CHRISTINA A VALDES 19564849510\nZelle credit\n$197.00",
    "01/12/2024\nZelle payment from TIMOTHY J PEARCE 19563839574\nZelle credit\n$75.00"
  ]
}
\`\`\`

IMPORTANT:
- Preserve the exact original text and line breaks within each chunk.
- Do NOT perform any data extraction or modification within the chunks.
- CRITICAL INSTRUCTION: Your response MUST BEGIN IMMEDIATELY with the opening brace '{' of the JSON object. DO NOT include ANY explanatory text, thinking, preamble, or markdown code blocks. Just the raw JSON. If you add ANY text before the JSON object, it will cause parsing errors.
- If no transactions can be clearly identified, return { "transaction_chunks": [] }.
`;
}

/**
 * Uses an LLM to split raw text into potential transaction chunks.
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
		const jsonResponse = await deepseekGenerateJson(prompt);
		console.log('[llmChunkTransactions] Received raw response from LLM for chunking.');
		// console.log('[llmChunkTransactions] Raw JSON:', jsonResponse); // Optional: Log raw response

		// Attempt to parse the JSON robustly
		let parsedData: any = null;
		try {
			parsedData = JSON.parse(jsonResponse);
		} catch (e) {
			console.warn('[llmChunkTransactions] Initial JSON parse failed, attempting to fix...');
			try {
				const fixedJson = fixCommonJsonErrors(jsonResponse); // Use the helper
				parsedData = JSON.parse(fixedJson);
				console.log('[llmChunkTransactions] Parsed successfully after fixing JSON.');
			} catch (fixError) {
				console.error('[llmChunkTransactions] Failed to parse JSON even after fixing:', fixError);
				console.error('[llmChunkTransactions] Original problematic JSON string:', jsonResponse);
				return []; // Return empty array if parsing fails definitively
			}
		}

		// Validate the parsed structure
		if (parsedData && Array.isArray(parsedData.transaction_chunks)) {
			// Further validation: ensure elements are strings
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
		return []; // Return empty array on API error
	}
}

/**
 * Helper function to fix common JSON errors (imported or defined here).
 * Placeholder - assuming this exists in llm-parser-helpers.ts or similar.
 * If not, you'd need to copy/paste the implementation from llm-parser.ts.
 * @param jsonStr The potentially malformed JSON string.
 * @returns A string with attempted fixes.
 */
// function fixCommonJsonErrors(jsonStr: string): string {
// 	// Implementation from src/lib/services/ai/extraction/llm-parser.ts
// 	// ... (copy the function here if not importing) ...
// 	if (!jsonStr || typeof jsonStr !== 'string') return '';
// 	let fixed = jsonStr.trim();
// 	fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
// 	fixed = fixed.replace(/\bNone\b/g, 'null');
// 	fixed = fixed.replace(/\bTrue\b/g, 'true');
// 	fixed = fixed.replace(/\bFalse\b/g, 'false');
// 	fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
// 	fixed = fixed.replace(/,\s*([\]}])/g, '$1');
// 	// Add more fixes as needed...
// 	return fixed;
// }
