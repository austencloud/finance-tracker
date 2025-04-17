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
import { extractCleanJson } from '$lib/utils/helpers';

/**
 * Parses LLM JSON output into an array of Transaction objects.
 * Applies an optional override to the amount based on the original input text.
 *
 * @param jsonString The raw JSON string returned by the LLM.
 * @param batchId    A unique identifier for this extraction batch.
 * @param originalText Optional: the user input text, used to override the amount if needed.
 * @returns Array of validated Transaction objects.
 */
export function parseTransactionsFromLLMResponse(raw: string, batchId: string): Transaction[] {
	// 1) try to strip markdown fences
	let jsonText = raw.trim().replace(/^```json\s*|\s*```$/gi, '');

	// 2) feed through our cleaner
	const cleaned = extractCleanJson(jsonText);
	if (cleaned) {
		jsonText = cleaned;
	}

	// 3) final parse
	let parsed: any;
	try {
		parsed = JSON.parse(jsonText);
	} catch (err) {
		console.error('[LLM Parser] JSON parse failed even after cleaning:', err, '\nRaw was:', raw);
		return [];
	}

	// 4) ensure it’s an array of objects
	const arr: any[] = Array.isArray(parsed)
		? parsed
		: parsed.transactions instanceof Array
			? parsed.transactions
			: [];

	// 5) map into Transaction with IDs and batchId
	return arr.map((o) => ({
		id: o.id || uuidv4(),
		batchId,
		date: o.date ?? 'unknown',
		description: o.description ?? 'unknown',
		type: o.type ?? 'unknown',
		amount: typeof o.amount === 'number' ? o.amount : parseFloat(o.amount) || 0,
		category: o.category ?? 'Other / Uncategorized',
		notes: o.details ?? '',
		direction: o.direction ?? 'unknown'
	}));
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
