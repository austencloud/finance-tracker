// src/lib/schemas/LLMOutputSchema.ts
import { z } from 'zod';
import { TransactionSchema } from './TransactionSchema'; // Re-use parts if applicable

// Schema for the raw transaction object expected directly from the LLM extraction prompt
export const LLMTransactionExtractionSchema = z.object({
	date: z.string().describe('Date in YYYY-MM-DD format or "unknown"'),
	description: z.string().describe('Description of the transaction or "unknown"'),
	details: z.string().describe('Additional details or ""'),
	type: z.string().describe('Type like Card, ACH, Zelle, etc., or "unknown"'),
	amount: z
		.number()
		.positive()
		.describe('Positive numeric amount, use 0 if unknown'),
	direction: z
		.enum(['IN', 'OUT', 'unknown'])
		.describe('Direction: IN, OUT, or "unknown" if ambiguous')
});

// Schema for the overall LLM response containing an array of transactions
export const LLMTransactionResponseSchema = z.object({
	transactions: z.array(LLMTransactionExtractionSchema).describe('Array of extracted transactions')
});

// Schema for LLM Chunking response
export const LLMChunkingResponseSchema = z.object({
    transaction_chunks: z.array(z.string()).describe("Array of text chunks, each representing one transaction block.")
});

// Schema for Category Suggestion response (assuming simple string)
export const LLMCategorySuggestionSchema = z.string(); // Or refine if more structure is needed

// Schema for AI Analysis response (assuming string)
export const LLMAnalysisResponseSchema = z.object({
    analysis: z.string().describe("Textual financial analysis")
});

// Schema for Anomaly Detection response
export const LLMAnomalySchema = z.object({
    index: z.number().int().nonnegative(),
    reason: z.string(),
    risk: z.enum(['low', 'medium', 'high'])
});
export const LLMAnomalyResponseSchema = z.object({
    anomalies: z.array(LLMAnomalySchema)
});

// Schema for Prediction response
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
// ... other inferred types if needed