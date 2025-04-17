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
import { TransactionSchema } from '$lib/schemas/TransactionSchema';
import type { Transaction } from '$lib/stores/types';
import { extractCleanJson } from '../parsers/fixJson';

/**
 * Parses LLM JSON output into an array of Transaction objects.
 * Applies an optional override to the amount based on the original input text.
 *
 * @param jsonString The raw JSON string returned by the LLM.
 * @param batchId    A unique identifier for this extraction batch.
 * @param originalText Optional: the user input text, used to override the amount if needed.
 * @returns Array of validated Transaction objects.
 */
export function parseTransactionsFromLLMResponse(
	jsonString: string,
	batchId: string,
	originalText: string = ''
): Transaction[] {
	console.log(`[LLM Parser] Parsing JSON for batch ${batchId}...`);
	if (!jsonString || typeof jsonString !== 'string' || !jsonString.trim()) {
		console.warn('[LLM Parser] Empty or invalid JSON string.');
		return [];
	}

	// Strip any leading non-JSON characters
	const firstChar = jsonString.search(/[\{\[]/);
	if (firstChar < 0) {
		console.warn('[LLM Parser] No JSON object/array found.');
		return [];
	}
	let jsonCandidate = jsonString.slice(firstChar).trim();

	// Attempt to parse JSON, with fallback to cleaning utility
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonCandidate);
	} catch (e) {
		console.warn('[LLM Parser] Initial JSON parse failed. Attempting to fix...');
		const cleaned = extractCleanJson(jsonCandidate);
		if (!cleaned) {
			console.error('[LLM Parser] JSON cleaning failed.');
			return [];
		}
		try {
			parsed = JSON.parse(cleaned);
			console.log('[LLM Parser] JSON parsed after cleaning.');
		} catch (err) {
			console.error('[LLM Parser] Failed to parse JSON after cleaning:', err);
			return [];
		}
	}

	// Validate against response schema or raw array schema
	let rawList: LLMTransactionExtraction[];
	const parsedResp = LLMTransactionResponseSchema.safeParse(parsed);
	if (parsedResp.success) {
		rawList = parsedResp.data.transactions;
		console.log(`[LLM Parser] Validated response schema with ${rawList.length} transactions.`);
	} else {
		const arrVal = z.array(LLMTransactionExtractionSchema).safeParse(parsed);
		if (!arrVal.success) {
			console.error('[LLM Parser] Validation failed:', parsedResp.error.flatten());
			return [];
		}
		rawList = arrVal.data;
		console.log(`[LLM Parser] Parsed direct array with ${rawList.length} transactions.`);
	}

	// Extract first numeric amount from originalText, if present
	const amtMatch = /\$?\s*(\d+(?:\.\d+)?)/.exec(originalText);
	const overrideAmt = amtMatch ? parseFloat(amtMatch[1]) : null;
	if (overrideAmt !== null) {
		console.log(`[LLM Parser] Detected override amount ${overrideAmt} from input text.`);
	}

	return convertLLMDataToTransactions(rawList, batchId, overrideAmt);
}

/**
 * Converts raw LLM extraction objects into validated Transaction instances.
 * Applies optional amount override and inference logic.
 */
function convertLLMDataToTransactions(
	rawTxns: LLMTransactionExtraction[],
	batchId: string,
	overrideAmt: number | null
): Transaction[] {
	return rawTxns
		.map((raw, index) => {
			try {
				let date = resolveAndFormatDate(raw.date);
				let description = raw.description.trim() || 'unknown';
				let type = raw.type.trim() || 'unknown';

				// Determine amount, with override if difference > 0.5
				let amount = raw.amount;
				if (overrideAmt !== null && Math.abs(amount - overrideAmt) > 0.5) {
					console.warn(`[LLM Converter] Overriding parsed amount ${amount} with ${overrideAmt}`);
					amount = overrideAmt;
				}

				let notes = raw.details?.trim() || '';
				let direction = raw.direction.toLowerCase() as 'in' | 'out' | 'unknown';

				// Infer direction when unknown
				if (direction === 'unknown') {
					const txt = (description + ' ' + type).toLowerCase();
					if (/credit|deposit|received/.test(txt)) {
						direction = 'in';
					} else if (/debit|payment|purchase|withdrawal|charge|bought/.test(txt)) {
						direction = 'out';
					}
				}

				// Categorize and adjust based on direction
				let category = categorizeTransaction(description, type);
				if (direction === 'out' && category === 'Other / Uncategorized') {
					category = 'Expenses';
				} else if (direction === 'in' && category === 'Expenses') {
					category = 'Other / Uncategorized';
				}

				const txn: Transaction = {
					id: uuidv4(),
					batchId,
					date,
					description,
					type,
					amount,
					category,
					notes,
					direction
				};

				// Final schema validation
				const validated = TransactionSchema.safeParse(txn);
				if (!validated.success) {
					console.warn(
						`[LLM Converter] Transaction failed schema check at index ${index}:`,
						validated.error.flatten()
					);
					return null;
				}
				return validated.data;
			} catch (err) {
				console.error(`[LLM Converter] Error converting transaction at index ${index}:`, err);
				return null;
			}
		})
		.filter((t): t is Transaction => t !== null);
}
