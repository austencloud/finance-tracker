import type { Transaction } from '$lib/stores/types';

import {
	llmGenerateJson,
	isLLMAvailable,
	getLLMFallbackResponse,
	chooseBackendForTask
} from './ai/llm';

import { parseJsonFromAiResponse } from '$lib/utils/helpers';

export async function calculateFinancialSummary(transactions: Transaction[]) {
	try {
		const stats = computeBasicStats(transactions);
		let analysisText: string | null = null;

		const llmAvailable = await isLLMAvailable();

		if (llmAvailable && transactions.length > 0) {
			try {
				analysisText = await getLLMAnalysis(transactions, stats);
			} catch (llmError) {
				console.error('Error getting LLM analysis:', llmError);
				analysisText = 'AI analysis currently unavailable due to an error.';
			}
		}

		return {
			...stats,
			analysis: analysisText
		};
	} catch (error) {
		console.error('Error calculating financial summary:', error);

		return { ...computeBasicStats(transactions), analysis: null };
	}
}

function computeBasicStats(transactions: Transaction[]) {
	const incomeTransactions = transactions.filter((t) => t.category !== 'Expenses');
	const expenseTransactions = transactions.filter((t) => t.category === 'Expenses');
	const incomeAmounts = incomeTransactions.map((t) => Number(t.amount || 0));
	const expenseAmounts = expenseTransactions.map((t) => Number(t.amount || 0));
	const totalIncome = incomeAmounts.reduce((sum, amount) => sum + amount, 0);
	const totalExpenses = expenseAmounts.reduce((sum, amount) => sum + amount, 0);
	const netCashflow = totalIncome - totalExpenses;
	const avgIncome = incomeAmounts.length > 0 ? totalIncome / incomeAmounts.length : 0;
	const avgExpense = expenseAmounts.length > 0 ? totalExpenses / expenseAmounts.length : 0;
	const highestIncome = Math.max(...(incomeAmounts.length > 0 ? incomeAmounts : [0]));
	const highestExpense = Math.max(...(expenseAmounts.length > 0 ? expenseAmounts : [0]));
	return {
		totalIncome,
		totalExpenses,
		netCashflow,
		avgIncome,
		avgExpense,
		highestIncome,
		highestExpense,
		savingsRate: totalIncome > 0 ? (netCashflow / totalIncome) * 100 : 0
	};
}

async function getLLMAnalysis(transactions: Transaction[], stats: any): Promise<string | null> {
	const transactionSample = transactions.slice(0, 25).map((t) => ({
		date: t.date,
		description: t.description,
		amount: Number(t.amount || 0),
		category: t.category
	}));

	const prompt = `
You are a financial analyst. Analyze these transaction statistics and provide insights:

Transaction Statistics:
- Total Income: $${stats.totalIncome.toFixed(2)}
- Total Expenses: $${stats.totalExpenses.toFixed(2)}
- Net Cashflow: $${stats.netCashflow.toFixed(2)}
- Savings Rate: ${stats.savingsRate.toFixed(1)}%

Sample Transaction Data (up to 25 transactions):
${JSON.stringify(transactionSample, null, 2)}

Provide a concise financial analysis (max 3 paragraphs) including:
1. Overview of the financial situation based ONLY on the provided stats and sample.
2. Key observations or potential areas of interest (e.g., high savings rate, significant expense category in sample).
3. 1-2 brief, general suggestions based on the stats (e.g., "Consider reviewing expense categories if net cashflow is negative").

Format your response as a JSON object with a single key "analysis" containing the analysis text string.
Example: {"analysis": "The net cashflow is positive..."}
CRITICAL: Output ONLY the raw JSON object. No preamble or explanation.
    `.trim();

	const backend = await chooseBackendForTask({
		type: 'json',
		complexity: 'medium',
		inputLength: prompt.length
	});

	console.log(`[getLLMAnalysis] Using ${backend} backend for financial analysis`);

	try {
		const jsonResponse = await llmGenerateJson(prompt, undefined, { temperature: 0.5 }, backend);

		const parsedJson = parseJsonFromAiResponse<{ analysis: string }>(jsonResponse);

		if (parsedJson && typeof parsedJson.analysis === 'string') {
			return parsedJson.analysis;
		} else {
			console.warn('[getLLMAnalysis] Failed to parse analysis from LLM response:', jsonResponse);

			return jsonResponse || 'AI analysis could not be parsed.';
		}
	} catch (error) {
		console.error('Error getting LLM analysis:', error);

		return `AI analysis unavailable: ${getLLMFallbackResponse(error)}`;
	}
}

export async function detectAnomalies(transactions: Transaction[]): Promise<{ anomalies: any[] }> {
	if (transactions.length < 5) {
		return { anomalies: [] };
	}

	const llmAvailable = await isLLMAvailable();
	if (!llmAvailable) {
		console.log('[detectAnomalies] LLM not available, skipping.');
		return { anomalies: [] };
	}

	try {
		const transactionData = transactions.map((t, index) => ({
			index,
			date: t.date,
			description: t.description,
			amount: Number(t.amount || 0),
			category: t.category
		}));

		const prompt = `
You are a financial anomaly detection system. Analyze the following list of transactions (with their original index) and identify potential anomalies based on unusual amounts, descriptions, patterns, or potential duplicates.

Transaction Data:
${JSON.stringify(transactionData, null, 2)}

Identify up to 3 potential anomalies. For each anomaly, provide:
- index: The original index of the transaction from the input list.
- reason: A brief explanation of why it's flagged (e.g., "Unusually high amount for category X", "Possible duplicate of transaction Y", "Vague description").
- risk: A risk level ('low', 'medium', 'high').

Format your response as a JSON object with a single key "anomalies", which is an array of objects containing "index", "reason", and "risk".
Example: {"anomalies": [{"index": 5, "reason": "Amount is much higher than typical expenses", "risk": "medium"}]}
CRITICAL: Output ONLY the raw JSON object. No preamble or explanation. If no anomalies are found, return {"anomalies": []}.
        `.trim();

		const backend = await chooseBackendForTask({
			type: 'json',
			complexity: 'high',
			inputLength: prompt.length
		});

		console.log(`[detectAnomalies] Using ${backend} backend for anomaly detection`);

		const jsonResponse = await llmGenerateJson(prompt, undefined, { temperature: 0.3 }, backend);

		const parsedJson = parseJsonFromAiResponse<{ anomalies: any[] }>(jsonResponse);

		if (parsedJson && Array.isArray(parsedJson.anomalies)) {
			return { anomalies: parsedJson.anomalies };
		} else {
			console.warn('[detectAnomalies] Failed to parse anomalies from LLM response:', jsonResponse);
			return { anomalies: [] };
		}
	} catch (error) {
		console.error('Error detecting anomalies:', error);

		return { anomalies: [] };
	}
}

export async function predictFutureTransactions(transactions: Transaction[]) {
	if (transactions.length < 10) {
		return {
			predictedIncome: 0,
			predictedExpenses: 0,
			reliability: 'low',
			message: 'Not enough data...'
		};
	}
	try {
		const monthlySummaries = new Map();

		const monthlyData = [...monthlySummaries.entries()];

		return {
			predictedIncome: 1000,
			predictedExpenses: 800,
			reliability: 'medium',
			message: 'Prediction based on X months.'
		};
	} catch (error) {
		console.error('Error predicting future transactions:', error);
		return {
			predictedIncome: 0,
			predictedExpenses: 0,
			reliability: 'none',
			message: 'Error generating predictions.'
		};
	}
}
