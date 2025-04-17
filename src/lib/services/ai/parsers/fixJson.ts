// src/lib/services/ai/helpers.ts

/**
 * Attempts to salvage almost‑JSON coming from the LLM.
 *  – trims leading/trailing junk
 *  – removes dangling commas before `}` or `]`
 *  – returns the first valid JSON substring or null
 */

// src/lib/services/ai/parsers/fixJson.ts

/**
 * Attempts to salvage almost-JSON strings, often returned by LLMs.
 * - Trims whitespace and markdown fences.
 * - Removes trailing commas before closing brackets/braces.
 * - Tries to find the first valid JSON object or array within the string.
 * @param text Potentially malformed JSON string.
 * @returns A cleaned JSON string ready for parsing, or null if unsalvageable.
 */
export function fixJson(text: string | null | undefined): string | null {
	if (!text) return null;

	let cleaned = text.trim();

	// Remove markdown fences
	cleaned = cleaned.replace(/^```json\s*|\s*```$/gi, '');

	// Attempt to find the start and end of the main JSON structure
	const firstBrace = cleaned.indexOf('{');
	const firstBracket = cleaned.indexOf('[');
	let start = -1;
	let end = -1;

	if (firstBrace === -1 && firstBracket === -1) return null; // No JSON structure found

	if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
		start = firstBrace;
		// Find the matching closing brace, considering nesting
		let braceDepth = 0;
		for (let i = start; i < cleaned.length; i++) {
			if (cleaned[i] === '{') braceDepth++;
			else if (cleaned[i] === '}') braceDepth--;
			if (braceDepth === 0) {
				end = i;
				break;
			}
		}
	} else if (firstBracket !== -1) {
		start = firstBracket;
		// Find the matching closing bracket, considering nesting
		let bracketDepth = 0;
		for (let i = start; i < cleaned.length; i++) {
			if (cleaned[i] === '[') bracketDepth++;
			else if (cleaned[i] === ']') bracketDepth--;
			if (bracketDepth === 0) {
				end = i;
				break;
			}
		}
	}

	if (start === -1 || end === -1) {
		// Try a simpler extraction if nesting logic failed (e.g., incomplete JSON)
		const lastBrace = cleaned.lastIndexOf('}');
		const lastBracket = cleaned.lastIndexOf(']');
		if (firstBrace !== -1 && lastBrace > firstBrace) {
			start = firstBrace;
			end = lastBrace;
		} else if (firstBracket !== -1 && lastBracket > firstBracket) {
			start = firstBracket;
			end = lastBracket;
		} else {
			return null; // Cannot determine structure
		}
	}

	cleaned = cleaned.substring(start, end + 1);

	// Remove trailing commas before closing braces/brackets
	// Regex: comma followed by whitespace, then closing brace/bracket
	cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

	// Basic validation before returning
	try {
		JSON.parse(cleaned);
		return cleaned;
	} catch {
		// If it still fails, return null
		console.warn('[fixJson] Could not salvage JSON after cleaning:', cleaned);
		return null;
	}
}
