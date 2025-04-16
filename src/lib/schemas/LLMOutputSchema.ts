// src/lib/schemas/LLMOutputSchema.ts
import { z } from 'zod';
// REMOVED: import { TransactionSchema } from './TransactionSchema'; // Not needed here

// Schema for the raw transaction object expected directly from the LLM extraction prompt
export const LLMTransactionExtractionSchema = z.object({
	date: z.string().describe('Date in YYYY-MM-DD format or "unknown"'),
	description: z.string().describe('Description of the transaction or "unknown"'),
	details: z.string().describe('Additional details or ""'),
	type: z.string().describe('Type like Card, ACH, Zelle, etc., or "unknown"'),
	amount: z
		.number()
		.positive()
		.describe('Positive numeric amount, use 0 if unknown')
		.or(z.literal(0)), // Allow 0 too
	// --- MODIFIED: Accept string, transform to uppercase, then validate enum ---
	direction: z
		.string() // Accept any string initially
		.transform((val) => val.toUpperCase()) // Transform to uppercase
		.pipe(z.enum(['IN', 'OUT', 'unknown'])) // THEN validate against uppercase enum
		.describe("Direction: IN, OUT, or 'unknown' if ambiguous")
});

// Schema for the overall LLM response containing an array of transactions
export const LLMTransactionResponseSchema = z.object({
	transactions: z.array(LLMTransactionExtractionSchema).describe('Array of extracted transactions')
});

// ... rest of the schemas (Chunking, Category Suggestion, Analysis, etc.) ...
export const LLMChunkingResponseSchema = z.object({
	transaction_chunks: z
		.array(z.string())
		.describe('Array of text chunks, each representing one transaction block.')
});
export const LLMCategorySuggestionSchema = z.string();
export const LLMAnalysisResponseSchema = z.object({
	analysis: z.string().describe('Textual financial analysis')
});
export const LLMAnomalySchema = z.object({
	index: z.number().int().nonnegative(),
	reason: z.string(),
	risk: z.enum(['low', 'medium', 'high'])
});
export const LLMAnomalyResponseSchema = z.object({
	anomalies: z.array(LLMAnomalySchema)
});
export const LLMPredictionResponseSchema = z.object({
	predictedIncome: z.number(),
	predictedExpenses: z.number(),
	reliability: z.enum(['none', 'low', 'medium', 'high']),
	message: z.string()
});

// --- Inferred Types ---
export type LLMTransactionExtraction = z.infer<typeof LLMTransactionExtractionSchema>;
export type LLMTransactionResponse = z.infer<typeof LLMTransactionResponseSchema>;
export type LLMChunkingResponse = z.infer<typeof LLMChunkingResponseSchema>;
