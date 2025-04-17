import { extractCleanJson } from '$lib/utils/helpers';

/**
 * More robust JSON parsing for bulk data handling.
 * Extracts valid JSON from potentially messy LLM responses.
 *
 * @param text Raw text that might contain JSON
 * @returns Parsed object or null if parsing fails
 */
export function robustJsonParse(text: string): any {
	if (!text || typeof text !== 'string') {
		return null;
	}

	// Try to find JSON blocks inside markdown code blocks
	const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonBlockMatch && jsonBlockMatch[1]) {
		try {
			return JSON.parse(jsonBlockMatch[1].trim());
		} catch (e) {
			console.warn('[robustJsonParse] Failed to parse JSON from markdown code block');
		}
	}

	// Try to extract clean JSON with helper function
	const cleanJson = extractCleanJson(text);
	if (cleanJson) {
		try {
			return JSON.parse(cleanJson);
		} catch (e) {
			console.warn('[robustJsonParse] Failed to parse clean JSON extract');
		}
	}

	// Last resort: look for array patterns directly
	const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
	if (arrayMatch) {
		try {
			return JSON.parse(arrayMatch[0]);
		} catch (e) {
			console.warn('[robustJsonParse] Failed to parse array match');
		}
	}

	// Try with a more lenient approach - find first [ to last ]
	const firstBracket = text.indexOf('[');
	const lastBracket = text.lastIndexOf(']');
	if (firstBracket !== -1 && lastBracket !== -1 && firstBracket < lastBracket) {
		const potentialJson = text.substring(firstBracket, lastBracket + 1);
		try {
			return JSON.parse(potentialJson);
		} catch (e) {
			console.warn('[robustJsonParse] Failed to parse using bracket extraction');
		}
	}

	// If all else fails, return null
	return null;
}
