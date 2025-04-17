// src/lib/stores/analysisStore.ts
import { writable, get } from 'svelte/store';
import { transactionStore } from './transactionStore';
import {
	calculateFinancialSummary,
	detectAnomalies,
	predictFutureTransactions
} from '$lib/services/analytics';
import { isOllamaAvailable } from '$lib/services/ai/ollama-client';
// *** Import the UPDATED types from types.ts ***
import type {
	AnalysisState,
	FinancialSummary, // Use the updated, detailed type
	AnomalyResult,
	PredictionResult // Use the updated, detailed type
} from '$lib/types/types'; // Adjust path if needed

// Initial state uses the imported types
const initialAnalysisState: AnalysisState = {
	summary: null, // Expects updated FinancialSummary | null
	anomalies: null, // Expects AnomalyResult | null
	predictions: null, // Expects updated PredictionResult | null
	loading: false,
	error: null
};

const { subscribe, update, set } = writable<AnalysisState>(initialAnalysisState);

const analysisActions = {
	run: async () => {
		const currentTransactions = get(transactionStore);
		if (currentTransactions.length === 0) {
			set(initialAnalysisState);
			return;
		}
		if (get(analysisStore).loading) return;
		analysisActions.setLoading(true);

		try {
			const llmCheck = await isOllamaAvailable();

			// These promises now resolve with the updated, detailed types
			const summaryPromise = calculateFinancialSummary(currentTransactions);
			const anomaliesPromise = llmCheck
				? detectAnomalies(currentTransactions)
				: Promise.resolve({ anomalies: [] });
			const predictionsPromise = predictFutureTransactions(currentTransactions);

			const [summaryResult, anomaliesResult, predictionsResult] = await Promise.all([
				summaryPromise,
				anomaliesPromise,
				predictionsPromise
			]);

			// summaryResult directly matches the updated FinancialSummary type (if return type in analytics.ts is set)
			// No need to manually create finalSummary unless analytics.ts returns slightly different structure
			const finalSummary: FinancialSummary | null = summaryResult; // Assign directly if types match
			const finalAnomalies: AnomalyResult | null = anomaliesResult; // Assign directly
			const finalPredictions: PredictionResult | null = predictionsResult
				? {
						...predictionsResult,
						projectedMonthlyNet:
							typeof predictionsResult.predictedIncome === 'number' &&
							typeof predictionsResult.predictedExpenses === 'number'
								? predictionsResult.predictedIncome - predictionsResult.predictedExpenses
								: 0
					}
				: null;

			analysisActions.setResults({
				summary: finalSummary,
				anomalies: finalAnomalies,
				predictions: finalPredictions
			});
		} catch (error) {
			console.error('Error during runFinancialAnalysis:', error);
			analysisActions.setError(error instanceof Error ? error.message : 'Unknown analysis error');
		}
	},

	setLoading: (loading: boolean) => {
		update((s) => ({ ...s, loading, error: loading ? null : s.error }));
	},

	// Update setResults signature to use the updated types from types.ts
	setResults: (
		results: {
			summary: FinancialSummary | null;
			anomalies: AnomalyResult | null;
			predictions: PredictionResult | null;
		} | null
	) => {
		update((s) => ({
			...s,
			summary: results?.summary ?? null,
			anomalies: results?.anomalies ?? initialAnalysisState.anomalies,
			predictions: results?.predictions ?? null,
			loading: false,
			error: null
		}));
	},

	setError: (error: string | null) => {
		update((s) => ({ ...s, error, loading: false }));
	}
};

export const analysisStore = {
	subscribe,
	...analysisActions
};
