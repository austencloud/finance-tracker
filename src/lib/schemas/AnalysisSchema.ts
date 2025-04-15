// src/lib/schemas/AnalysisSchema.ts
import { z } from 'zod';
import { LLMAnomalyResponseSchema, LLMPredictionResponseSchema } from './LLMOutputSchema'; // Reuse if structure matches

// Schema for basic stats computed locally
export const BasicFinancialStatsSchema = z.object({
	totalIncome: z.number(),
	totalExpenses: z.number(),
	netCashflow: z.number(),
	avgIncome: z.number(),
	avgExpense: z.number(),
	highestIncome: z.number(),
	highestExpense: z.number(),
	savingsRate: z.number()
});

// Schema for the full financial summary including potential AI analysis
export const FinancialSummarySchema = BasicFinancialStatsSchema.extend({
	analysis: z.string().nullable().describe('AI-generated analysis text, or null if unavailable')
});

// Export inferred types
export type FinancialSummary = z.infer<typeof FinancialSummarySchema>;
export type AnomalyDetectionResult = z.infer<typeof LLMAnomalyResponseSchema>; // Assuming LLM structure is used
export type PredictionResult = z.infer<typeof LLMPredictionResponseSchema>; // Assuming LLM structure is used
