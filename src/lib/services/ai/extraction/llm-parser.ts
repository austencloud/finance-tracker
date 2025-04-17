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
import type { Transaction } from '$lib/types/types';
// import { extractCleanJson } from '$lib/utils/helpers'; // Keep if used elsewhere, but we use fixJson now
import { fixJson } from '../parsers/fixJson'; // Import the new fixer

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
	// 1) Use the robust fixer first
	const fixedJsonText = fixJson(raw);

	if (!fixedJsonText) {
		console.error('[LLM Parser] Could not salvage JSON even after fixing attempts. Raw was:', raw);
		return [];
	}

	let parsed: any;
	try {
		parsed = JSON.parse(fixedJsonText);
	} catch (err) {
		// This should be less common now, but keep as a final safety net
		console.error(
			'[LLM Parser] JSON parse failed even after fixing:',
			err,
			'\nFixed JSON was:',
			fixedJsonText
		);
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
		date: resolveAndFormatDate(o.date),
		description: o.description ?? 'unknown',
		type: o.type ?? 'unknown',
		amount: typeof o.amount === 'number' ? o.amount : parseFloat(o.amount) || 0,
		currency: o.currency?.toUpperCase() ?? 'USD',
		category: o.category ?? 'Other / Uncategorized',
		categories: o.categories ?? [], // Ensure categories property exists
		notes: o.details ?? '',
		direction: o.direction ?? 'unknown'
	}));
}
