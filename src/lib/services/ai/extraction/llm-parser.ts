// src/lib/services/ai/extraction/llm-parser.ts

import { v4 as uuidv4 } from 'uuid';
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '../../categorizer';
import { z } from 'zod';
import {
	LLMTransactionResponseSchema,
	LLMTransactionExtractionSchema,
	type LLMTransactionExtraction
} from '$lib/schemas/LLMOutputSchema';
import { TransactionSchema } from '$lib/schemas/TransactionSchema'; // Schema now includes batchId
import type { Transaction } from '$lib/stores/types'; // Type includes batchId
import { extractCleanJson } from '../parsers/fixJson';

// fixCommonJsonErrors function remains the same...

export function parseTransactionsFromLLMResponse(
	jsonString: string,
	batchId: string
): Transaction[] {
	console.log(`[LLM Parser] Attempting to parse/validate JSON for batch ${batchId}...`);
	if (!jsonString || typeof jsonString !== 'string' || jsonString.trim().length === 0) {
		console.warn('[LLM Parser] Received empty or invalid input string.');
		return [];
	}

	// Harden: Strip everything before the first '{' or '['
	const firstJsonChar = jsonString.search(/[{\[]/);
	if (firstJsonChar === -1) {
		console.warn('[LLM Parser] No JSON start found in string:', jsonString.slice(0, 120));
		return [];
	}
	const jsonCandidate = jsonString.slice(firstJsonChar).trim();

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(jsonCandidate);
	} catch (parseError) {
		console.warn('[LLM Parser] Initial JSON parse failed. Trying with fixes...');
		try {
			const fixedJsonString = extractCleanJson(jsonCandidate);
			if (fixedJsonString == null) throw new Error('extractCleanJson returned null');
			parsedJson = JSON.parse(fixedJsonString);
			console.log('[LLM Parser] Parsed successfully after attempting fixes.');
		} catch (fixParseError) {
			console.error('[LLM Parser] Failed to parse JSON even after fixing attempts:', fixParseError);
			console.error('[LLM Parser] Original problematic JSON string:', jsonString);
			return [];
		}
	}

	const validationResult = LLMTransactionResponseSchema.safeParse(parsedJson);

	if (!validationResult.success) {
		const arrayValidationResult = z.array(LLMTransactionExtractionSchema).safeParse(parsedJson);
		if (arrayValidationResult.success) {
			console.log('[LLM Parser] Validated as direct transaction array.');
			return convertLLMDataToTransactions(arrayValidationResult.data, batchId);
		} else {
			console.error('[LLM Parser] Zod validation failed:', validationResult.error.flatten());
			console.error('[LLM Parser] Parsed JSON object was:', parsedJson);
			return [];
		}
	}

	console.log(
		`[LLM Parser] Zod validation successful. Found ${validationResult.data.transactions.length} raw transactions.`
	);
	return convertLLMDataToTransactions(validationResult.data.transactions, batchId);
}

// --- Add batchId parameter ---
function convertLLMDataToTransactions(
	rawLLMTransactions: LLMTransactionExtraction[],
	batchId: string // <-- Added parameter
): Transaction[] {
	const validatedTransactions: Transaction[] = [];

	rawLLMTransactions.forEach((rawTxn, index) => {
		try {
			// ... (Data Transformation & Validation for date, desc, type, amount, notes, direction remains the same) ...
			const date = resolveAndFormatDate(rawTxn.date);
			const description = rawTxn.description.trim() || 'unknown';
			const type = rawTxn.type.trim() || 'unknown';
			const amount = rawTxn.amount;
			const notes = rawTxn.details?.trim() || '';
			let direction = rawTxn.direction.toLowerCase() as 'in' | 'out' | 'unknown';

			if (amount <= 0 && description === 'unknown' && date === 'unknown') {
				console.warn(`[LLM Converter] Skipping raw transaction at index ${index}...`);
				return;
			}
			if (direction === 'unknown') {
				// ... (direction inference logic remains the same) ...
				const combinedText = (description + ' ' + type).toLowerCase();
				if (
					combinedText.includes('credit') ||
					combinedText.includes('deposit') ||
					combinedText.includes('received') ||
					combinedText.includes('payment from') ||
					description.toLowerCase().includes('sparkles enterta payroll')
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
					console.warn(
						`[LLM Converter] Could not reliably determine direction for index ${index}...`
					);
				}
			}
			let category = categorizeTransaction(description, type);
			if (direction === 'out' && category === 'Other / Uncategorized') {
				category = 'Expenses';
			} else if (direction === 'in' && category === 'Expenses') {
				category = 'Other / Uncategorized';
			}

			// --- Create Final Object including the passed batchId ---
			const finalTxnData: Transaction = {
				id: uuidv4(), // Generate unique ID for the transaction itself
				batchId: batchId, // <-- Assign the passed batchId
				date,
				description,
				type,
				amount,
				category,
				notes,
				direction
			};

			// Final validation against our application's Transaction schema
			const finalCheck = TransactionSchema.safeParse(finalTxnData); // Schema now includes batchId
			if (finalCheck.success) {
				// Use finalCheck.data to ensure validated data is pushed
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
		`[LLM Converter] Successfully converted/validated ${validatedTransactions.length} out of ${rawLLMTransactions.length} raw transactions for batch ${batchId}.`
	);
	return validatedTransactions;
}
