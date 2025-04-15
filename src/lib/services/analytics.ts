// src/lib/services/analytics.ts
import type { Transaction } from '$lib/types/transactionTypes';
import { deepseekChat, isLLMAvailable } from './ai/deepseek-client';

/**
 * Process financial calculations using the LLM
 */
export async function calculateFinancialSummary(transactions: Transaction[]) {
	try {
		// Calculate basic statistics
		const stats = computeBasicStats(transactions);

		// For more complex calculations, use the LLM
		const llmAvailable = await isLLMAvailable();
		const llmSummary = llmAvailable ? await getLLMAnalysis(transactions, stats) : null;

		return {
			...stats,
			analysis: llmSummary
		};
	} catch (error) {
		console.error('Error calculating financial summary:', error);
		return computeBasicStats(transactions);
	}
}

/**
 * Calculate basic statistics without LLM
 */
function computeBasicStats(transactions: Transaction[]) {
	// Filter for income and expense transactions
	const incomeTransactions = transactions.filter((t) => t.category !== 'Expenses');
	const expenseTransactions = transactions.filter((t) => t.category === 'Expenses');

	// Convert amounts to numbers
	const incomeAmounts = incomeTransactions.map((t) =>
		parseFloat(t.amount.toString().replace(/[$,]/g, ''))
	);

	const expenseAmounts = expenseTransactions.map((t) =>
		parseFloat(t.amount.toString().replace(/[$,]/g, ''))
	);

	// Calculate totals
	const totalIncome = incomeAmounts.reduce((sum, amount) => sum + amount, 0);
	const totalExpenses = expenseAmounts.reduce((sum, amount) => sum + amount, 0);
	const netCashflow = totalIncome - totalExpenses;

	// Calculate averages
	const avgIncome = incomeAmounts.length > 0 ? totalIncome / incomeAmounts.length : 0;
	const avgExpense = expenseAmounts.length > 0 ? totalExpenses / expenseAmounts.length : 0;

	// Find highest transaction
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

/**
 * Get financial analysis from the LLM
 */
async function getLLMAnalysis(transactions: Transaction[], stats: any) {
	try {
		// Prepare transaction data for LLM (limit to avoid token limits)
		const transactionSample = transactions.slice(0, 20).map((t) => ({
			date: t.date,
			description: t.description,
			amount: parseFloat(t.amount.toString().replace(/[$,]/g, '')),
			category: t.category
		}));

		const prompt = `
    You are a financial analyst. Analyze these transaction statistics and provide insights:
    
    Transaction Statistics:
    - Total Income: $${stats.totalIncome.toFixed(2)}
    - Total Expenses: $${stats.totalExpenses.toFixed(2)}
    - Net Cashflow: $${stats.netCashflow.toFixed(2)}
    - Average Income Transaction: $${stats.avgIncome.toFixed(2)}
    - Average Expense Transaction: $${stats.avgExpense.toFixed(2)}
    - Highest Income: $${stats.highestIncome.toFixed(2)}
    - Highest Expense: $${stats.highestExpense.toFixed(2)}
    - Savings Rate: ${stats.savingsRate.toFixed(1)}%
    
    Sample Transaction Data (first 20 transactions):
    ${JSON.stringify(transactionSample, null, 2)}
    
    Provide a short financial analysis (max 3 paragraphs) including:
    1. Overview of the financial situation
    2. Key strengths and areas of concern
    3. 1-2 actionable suggestions for improvement
    
    Format your response as a JSON object with a single "analysis" field containing the analysis text.
    `;

		// Use DeepSeek API instead of local Ollama
		const response = await deepseekChat([{ role: 'user', content: prompt }]);

		// Extract JSON from response
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			try {
				const parsedJson = JSON.parse(jsonMatch[0]);
				return parsedJson.analysis || 'Analysis not available.';
			} catch (e) {
				// If we can't parse JSON, return the raw response
				return response;
			}
		}

		// Return the raw response if no JSON is found
		return response || 'Analysis not available.';
	} catch (error) {
		console.error('Error getting LLM analysis:', error);
		return 'Analysis not available due to an error.';
	}
}

/**
 * Use LLM to analyze transaction data for patterns and anomalies
 */
export async function detectAnomalies(transactions: Transaction[]) {
	if (transactions.length < 5) {
		return { anomalies: [] };
	}

	try {
		// Check if LLM is available
		const llmAvailable = await isLLMAvailable();
		if (!llmAvailable) {
			return { anomalies: [] };
		}

		// Prepare transaction data
		const transactionData = transactions.map((t, index) => ({
			index,
			date: t.date,
			description: t.description,
			amount: parseFloat(t.amount.toString().replace(/[$,]/g, '')),
			category: t.category
		}));

		const prompt = `
    You are a financial fraud detection system. Analyze these transactions and identify potential anomalies:
    
    Transaction Data:
    ${JSON.stringify(transactionData, null, 2)}
    
    Identify up to 3 unusual or anomalous transactions based on:
    1. Unusually large amounts compared to typical transactions
    2. Unusual transaction descriptions or merchants
    3. Unusual patterns or frequencies
    4. Potential duplicates
    
    For each anomaly, provide:
    - The index of the transaction
    - A brief explanation of why it's flagged
    - A risk level (low, medium, high)
    
    Format your response as a JSON object with an "anomalies" array containing objects with "index", "reason", and "risk" fields.
    `;

		// Use DeepSeek API instead of local Ollama
		const response = await deepseekChat([{ role: 'user', content: prompt }]);

		// Extract JSON from response
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[0]);
			} catch (e) {
				console.error('Error parsing anomalies JSON:', e);
				return { anomalies: [] };
			}
		}

		return { anomalies: [] };
	} catch (error) {
		console.error('Error detecting anomalies:', error);
		return { anomalies: [] };
	}
}

/**
 * Calculate predicted future transactions based on historical data
 */
export async function predictFutureTransactions(transactions: Transaction[]) {
	if (transactions.length < 10) {
		return {
			predictedIncome: 0,
			predictedExpenses: 0,
			reliability: 'low',
			message: 'Not enough transaction history for reliable predictions.'
		};
	}

	try {
		// Create monthly summaries
		const monthlySummaries = new Map();

		transactions.forEach((transaction) => {
			try {
				// Extract year and month from transaction date
				let yearMonth = '';
				if (/\d{4}-\d{2}-\d{2}/.test(transaction.date)) {
					yearMonth = transaction.date.substring(0, 7); // YYYY-MM format
				} else if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(transaction.date)) {
					const [month, day, year] = transaction.date.split('/');
					yearMonth = `${year}-${month.padStart(2, '0')}`;
				} else if (/\w+ \d{1,2}, \d{4}/.test(transaction.date)) {
					const date = new Date(transaction.date);
					if (!isNaN(date.getTime())) {
						const year = date.getFullYear();
						const month = (date.getMonth() + 1).toString().padStart(2, '0');
						yearMonth = `${year}-${month}`;
					}
				}

				if (!yearMonth) return;

				// Initialize month summary if it doesn't exist
				if (!monthlySummaries.has(yearMonth)) {
					monthlySummaries.set(yearMonth, { income: 0, expenses: 0 });
				}

				// Add transaction to month summary
				const amount = parseFloat(transaction.amount.toString().replace(/[$,]/g, ''));
				if (transaction.category === 'Expenses') {
					monthlySummaries.get(yearMonth).expenses += amount;
				} else {
					monthlySummaries.get(yearMonth).income += amount;
				}
			} catch (error) {
				console.error('Error processing transaction for prediction:', error);
			}
		});

		// Convert to array and sort by month
		const monthlyData = [...monthlySummaries.entries()]
			.map(([month, data]) => ({ month, ...data }))
			.sort((a, b) => a.month.localeCompare(b.month));

		// Calculate averages for prediction
		let totalIncome = 0;
		let totalExpenses = 0;

		monthlyData.forEach((month) => {
			totalIncome += month.income;
			totalExpenses += month.expenses;
		});

		const avgMonthlyIncome = totalIncome / monthlyData.length;
		const avgMonthlyExpenses = totalExpenses / monthlyData.length;

		// Get more sophisticated predictions if we have enough data
		if (monthlyData.length >= 3) {
			const recentMonths = monthlyData.slice(-3);
			const recentIncome = recentMonths.reduce((sum, month) => sum + month.income, 0) / 3;
			const recentExpenses = recentMonths.reduce((sum, month) => sum + month.expenses, 0) / 3;

			// Weight recent months more heavily (70% recent, 30% all-time)
			const predictedIncome = recentIncome * 0.7 + avgMonthlyIncome * 0.3;
			const predictedExpenses = recentExpenses * 0.7 + avgMonthlyExpenses * 0.3;

			return {
				predictedIncome,
				predictedExpenses,
				reliability: monthlyData.length >= 6 ? 'high' : 'medium',
				message: `Prediction based on ${monthlyData.length} months of data.`
			};
		}

		// Simple prediction based on all data
		return {
			predictedIncome: avgMonthlyIncome,
			predictedExpenses: avgMonthlyExpenses,
			reliability: 'low',
			message: `Basic prediction based on limited data (${monthlyData.length} months).`
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
