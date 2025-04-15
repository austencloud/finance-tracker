// src/lib/services/ai/extraction/llm-parser.ts

import { v4 as uuidv4 } from 'uuid';
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '../../categorizer';
import { z } from 'zod'; // <-- Added Zod import
import {
	LLMTransactionResponseSchema,
	LLMTransactionExtractionSchema,
	type LLMTransactionExtraction
} from '$lib/schemas/LLMOutputSchema'; // Import Zod schemas
import { TransactionSchema } from '$lib/schemas/TransactionSchema';
import type { Transaction } from '$lib/stores/types';

/**
 * Attempts to fix common JSON syntax errors often produced by LLMs.
 * (Keep this function as a fallback/helper if needed, but rely more on JSON mode + Zod)
 */
export function fixCommonJsonErrors(jsonStr: string): string {
	// ... (keep existing implementation)
	if (!jsonStr || typeof jsonStr !== 'string') return '';
	let fixed = jsonStr.trim();

	// Remove leading/trailing non-JSON characters (like ```json ... ```)
	fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	fixed = fixed.replace(/^```\s*/, '').replace(/\s*```$/, ''); // Handle case with just ```

	// Remove Pythonic None/True/False
	fixed = fixed.replace(/\bNone\b/g, 'null');
	fixed = fixed.replace(/\bTrue\b/g, 'true');
	fixed = fixed.replace(/\bFalse\b/g, 'false');

	// Add missing quotes around keys (simplified)
	fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

	// Fix trailing commas
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');

	// Remove comments (less common from APIs, but safe to include)
	fixed = fixed.replace(/\/\/.*$/gm, '');
	fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

	// Basic comma insertion attempts (use cautiously)
	fixed = fixed.replace(/(\")\s+(\")/g, '$1, $2'); // " ... " -> ", "
	fixed = fixed.replace(/(\})\s+(\{)/g, '$1, $2'); // } ... { -> }, {
	fixed = fixed.replace(/(\])\s+(\[)/g, '$1, $2'); // ] ... [ -> ], [
	fixed = fixed.replace(/(\d)\s+(\")/g, '$1, $2'); // 1 ... " -> 1, "
	fixed = fixed.replace(/(\")\s+(\{)/g, '$1, $2'); // " ... { -> ", {

	return fixed;
}

/**
 * Parses a JSON string from the LLM response, validates it against the expected schema,
 * and converts valid data into Transaction objects.
 * @param jsonString The raw string response from the LLM (ideally obtained via JSON mode).
 * @returns An array of validated Transaction objects.
 */
export function parseTransactionsFromLLMResponse(jsonString: string): Transaction[] {
	console.log('[LLM Parser] Attempting to parse and validate JSON response...');

	if (!jsonString || typeof jsonString !== 'string' || jsonString.trim().length === 0) {
		console.warn('[LLM Parser] Received empty or invalid input string.');
		return [];
	}

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(jsonString);
	} catch (parseError) {
		console.warn('[LLM Parser] Initial JSON parse failed. Trying with fixes...');
		try {
			const fixedJsonString = fixCommonJsonErrors(jsonString);
			parsedJson = JSON.parse(fixedJsonString);
			console.log('[LLM Parser] Parsed successfully after attempting fixes.');
		} catch (fixParseError) {
			console.error('[LLM Parser] Failed to parse JSON even after fixing attempts:', fixParseError);
			console.error('[LLM Parser] Original problematic JSON string:', jsonString);
			return []; // Parsing failed definitively
		}
	}

	// --- Zod Validation ---
	// Expecting { "transactions": [...] }
	const validationResult = LLMTransactionResponseSchema.safeParse(parsedJson);

	if (!validationResult.success) {
		// Maybe it's just the array?
		const arrayValidationResult = z.array(LLMTransactionExtractionSchema).safeParse(parsedJson);
		if (arrayValidationResult.success) {
			console.log('[LLM Parser] Validated as direct transaction array.');
			// Convert raw LLM data to application's Transaction format
			return convertLLMDataToTransactions(arrayValidationResult.data);
		} else {
			console.error('[LLM Parser] Zod validation failed:', validationResult.error.flatten());
			console.error('[LLM Parser] Parsed JSON object was:', parsedJson); // Log the object that failed validation
			return []; // Validation failed
		}
	}

	console.log(
		`[LLM Parser] Zod validation successful. Found ${validationResult.data.transactions.length} raw transactions.`
	);
	// Convert raw LLM data to application's Transaction format
	return convertLLMDataToTransactions(validationResult.data.transactions);
}

/**
 * Converts raw transaction data extracted by the LLM (and validated by Zod)
 * into the application's Transaction format.
 * @param rawLLMTransactions An array of raw transaction objects matching LLMTransactionExtractionSchema.
 * @returns An array of validated Transaction objects.
 */
function convertLLMDataToTransactions(
	rawLLMTransactions: LLMTransactionExtraction[]
): Transaction[] {
	const validatedTransactions: Transaction[] = [];

	rawLLMTransactions.forEach((rawTxn, index) => {
		try {
			// --- Data Transformation & Validation ---
			const date = resolveAndFormatDate(rawTxn.date); // Already string from Zod schema
			const description = rawTxn.description.trim() || 'unknown'; // Already string
			const type = rawTxn.type.trim() || 'unknown'; // Already string
			const amount = rawTxn.amount; // Already number > 0 or 0 from Zod schema
			const notes = rawTxn.details?.trim() || ''; // Map 'details' to 'notes'
			let direction = rawTxn.direction.toLowerCase() as 'in' | 'out' | 'unknown'; // Already enum from Zod schema

			// --- Validation (Example: skip if essential info missing) ---
			if (amount <= 0 && description === 'unknown' && date === 'unknown') {
				console.warn(
					`[LLM Converter] Skipping raw transaction at index ${index} due to missing amount/description/date:`,
					rawTxn
				);
				return; // continue to next iteration
			}

			// --- Refine Direction if 'unknown' (using similar logic as before) ---
			if (direction === 'unknown') {
				const combinedText = (description + ' ' + type).toLowerCase();
				if (
					combinedText.includes('credit') ||
					combinedText.includes('deposit') ||
					combinedText.includes('received') ||
					combinedText.includes('payment from') ||
					description.toLowerCase().includes('sparkles enterta payroll') // Example
				) {
					direction = 'in';
				} else if (
					combinedText.includes('debit') ||
					combinedText.includes('payment') ||
					combinedText.includes('purchase') ||
					combinedText.includes('withdrawal') ||
					combinedText.includes('charge') ||
					combinedText.includes('bought') ||
					type.toLowerCase() === 'card' ||
					type.toLowerCase() === 'atm'
				) {
					direction = 'out';
				} else {
					// Keep 'unknown' if still ambiguous
					console.warn(
						`[LLM Converter] Could not reliably determine direction for index ${index}, leaving as 'unknown'.`
					);
				}
			}

			// --- Categorization ---
			let category = categorizeTransaction(description, type);
			// Adjust category based on final direction
			if (direction === 'out' && category === 'Other / Uncategorized') {
				category = 'Expenses';
			} else if (direction === 'in' && category === 'Expenses') {
				category = 'Other / Uncategorized'; // Or re-categorize based on income rules
			}

			// --- Create Final Object (Using TransactionSchema for final check) ---
			const finalTxnData: Transaction = {
				id: uuidv4(),
				date,
				description,
				type,
				amount,
				category,
				notes,
				direction
			};

			// Final validation against our application's Transaction schema
			const finalCheck = TransactionSchema.safeParse(finalTxnData);
			if (finalCheck.success) {
				validatedTransactions.push(finalCheck.data);
			} else {
				console.warn(
					`[LLM Converter] Final validation failed for transaction at index ${index}:`,
					finalCheck.error.flatten()
				);
				console.warn('[LLM Converter] Original raw data:', rawTxn);
				console.warn('[LLM Converter] Converted data before final validation:', finalTxnData);
			}
		} catch (error) {
			console.error(`[LLM Converter] Error processing raw transaction at index ${index}:`, error);
			console.error('[LLM Converter] Raw data was:', rawTxn);
		}
	});

	console.log(
		`[LLM Converter] Successfully converted and validated ${validatedTransactions.length} out of ${rawLLMTransactions.length} raw transactions.`
	);
	return validatedTransactions;
}
