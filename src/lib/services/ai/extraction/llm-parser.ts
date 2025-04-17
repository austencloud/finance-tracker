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

	const arr: any[] = Array.isArray(parsed)
		? parsed
		: parsed.transactions instanceof Array
			? parsed.transactions
			: [];

	// Map into Transaction, now including currency
	return arr.map((o) => ({
		id: o.id || uuidv4(),
		batchId,
		date: o.date ?? 'unknown',
		description: o.description ?? 'unknown',
		type: o.type ?? 'unknown',
		amount: typeof o.amount === 'number' ? o.amount : parseFloat(o.amount) || 0,
		currency: o.currency ?? 'USD', // <-- EXTRACT CURRENCY, default to USD
		category: o.category ?? 'Other / Uncategorized',
		notes: o.details ?? '',
		direction: o.direction ?? 'unknown'
	}));
}
