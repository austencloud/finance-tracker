// ─────────────────────────  analytics.ts  ─────────────────────────
import { BASE_CURRENCY } from '$lib/config/constants';
import type { Transaction } from '$lib/types/types';
import { getAmountInBase } from './conversion';
// at the top of services/analytics.ts
export interface FinancialSummary {
	totalIncome: number;
	totalExpenses: number;
	netCashflow: number;
	savingsRate: number;
	analysis?: string;
}
export interface Anomaly {
	index: number;
	risk: 'low' | 'medium' | 'high';
	reason: string;
}
export interface AnomalyResult {
	anomalies: Anomaly[];
}
export interface PredictionResult {
	predictedIncome: number;
	predictedExpenses: number;
	reliability: 'none' | 'low' | 'medium' | 'high';
	message: string;
}

/* ------------------------------------------------------------------
   1)  SUMMARY (Now Async)
------------------------------------------------------------------- */
export async function calculateFinancialSummary(txns: Transaction[]) {
	let income = 0;
	let expense = 0;
	let conversionErrors = 0;
	const byCategory: Record<string, number> = {};
	const byMonth: Record<string, number> = {};
	const incomeArr: number[] = [];
	const expenseArr: number[] = [];

	for (const t of txns) {
		const amountInBase = await getAmountInBase(t);

		if (amountInBase === null) {
			conversionErrors++;
			continue; // Skip transactions that couldn't be converted
		}

		const signedAmountInBase = (t.direction === 'out' ? -1 : 1) * Math.abs(amountInBase);

		// --- Use converted amounts for calculations ---
		if (t.direction === 'in') {
			income += Math.abs(amountInBase);
			incomeArr.push(Math.abs(amountInBase));
		} else if (t.direction === 'out') {
			expense += Math.abs(amountInBase);
			expenseArr.push(Math.abs(amountInBase));
		}

		if (t.category) {
			byCategory[t.category] = (byCategory[t.category] ?? 0) + signedAmountInBase;
		}

		// Use original date for bucket key, but converted amount
		const [y, m] = t.date.split('-'); // YYYY-MM-DD
		if (y && m) {
			// Ensure date is valid enough to split
			const bucket = `${y}-${m}`; // YYYY-MM
			byMonth[bucket] = (byMonth[bucket] ?? 0) + signedAmountInBase;
		}
		// --- End using converted amounts ---
	}

	const net = income - expense;
	const savingsRate = income === 0 ? 0 : +(100 * (net / income)).toFixed(1);
	const avgIncome = incomeArr.length
		? +(incomeArr.reduce((a, b) => a + b, 0) / incomeArr.length).toFixed(2)
		: 0;
	const avgExpense = expenseArr.length
		? +(expenseArr.reduce((a, b) => a + b, 0) / expenseArr.length).toFixed(2)
		: 0;
	const highestIncome = incomeArr.length ? Math.max(...incomeArr) : 0;
	const highestExpense = expenseArr.length ? Math.max(...expenseArr) : 0;

	// Log errors if any occurred
	if (conversionErrors > 0) {
		console.warn(
			`[calculateFinancialSummary] Skipped ${conversionErrors} transactions due to missing date or conversion rate.`
		);
	}

	// Return results in BASE_CURRENCY
	return {
		totalIncome: income,
		totalExpenses: expense,
		netCashflow: net,
		avgIncome,
		avgExpense,
		highestIncome,
		highestExpense,
		savingsRate, // %
		analysis: null,
		byCategory,
		byMonth,
		conversionErrors // Optionally return error count
	};
}

/* ------------------------------------------------------------------
   2)  ANOMALIES (Now Async)
------------------------------------------------------------------- */
export async function detectAnomalies(txns: Transaction[]) {
	const grouped: Record<string, number[]> = {};
	let conversionErrors = 0;

	for (const t of txns) {
		if (!t.category) continue;

		const amountInBase = await getAmountInBase(t);
		if (amountInBase === null) {
			conversionErrors++;
			continue; // Skip if conversion failed
		}
		// Group by category using the absolute BASE CURRENCY amount
		(grouped[t.category] ??= []).push(Math.abs(amountInBase));
	}

	const med = (arr: number[]) =>
		arr.length === 0 ? 0 : arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];

	const medians: Record<string, number> = {};
	for (const c in grouped) {
		medians[c] = med(grouped[c]);
	}

	const anomaliesPromises = txns.map(async (t, index): Promise<Anomaly | null> => {
		const base = medians[t.category ?? ''];
		if (base <= 0) return null; // No median or zero median

		const amountInBase = await getAmountInBase(t);
		if (amountInBase === null) return null; // Skip if conversion failed

		if (Math.abs(amountInBase) > 3 * base) {
			// Anomaly detected based on base currency values
			return {
				index: index, // Keep original index for reference
				// Risk calculation could also be based on deviation from median
				risk:
					Math.abs(amountInBase) > 6 * base
						? 'high'
						: Math.abs(amountInBase) > 4 * base
							? 'medium'
							: 'low',
				reason: `Amount (${t.amount} ${t.currency} ≈ ${amountInBase.toFixed(2)} ${BASE_CURRENCY}) significantly deviates from the median for category '${t.category}' (Median ≈ ${base.toFixed(2)} ${BASE_CURRENCY}).`
			};
		}
		return null;
	});

	const resolvedAnomalies = (await Promise.all(anomaliesPromises)).filter(
		(a): a is Anomaly => a !== null
	);

	if (conversionErrors > 0) {
		console.warn(
			`[detectAnomalies] Skipped ${conversionErrors} transactions during median calculation due to missing date or conversion rate.`
		);
	}

	return { anomalies: resolvedAnomalies };
}

/* ------------------------------------------------------------------
   3)  PREDICTION (Now Async)
------------------------------------------------------------------- */
export async function predictFutureTransactions(txns: Transaction[]) {
	if (txns.length === 0) return null;

	const buckets: Record<string, number> = {};
	let conversionErrors = 0;

	for (const t of txns) {
		if (t.date === 'unknown' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(t.date)) continue;
		const amountInBase = await getAmountInBase(t);
		if (amountInBase === null) {
			conversionErrors++;
			continue;
		}
		const signedAmountInBase = (t.direction === 'out' ? -1 : 1) * Math.abs(amountInBase);
		const key = t.date.slice(0, 7);
		buckets[key] = (buckets[key] ?? 0) + signedAmountInBase;
	}

	const monthlyTotals = Object.values(buckets);
	if (monthlyTotals.length < 2) return null;

	const avg = +(monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length).toFixed(2);

	if (conversionErrors > 0) {
		console.warn(
			`[predictFutureTransactions] Prediction based on data excluding ${conversionErrors} unconverted transactions.`
		);
	}

	return {
		predictedIncome: avg > 0 ? avg : 0,
		predictedExpenses: avg < 0 ? Math.abs(avg) : 0,
		reliability: 'medium' as const,
		message: 'Projection based on average monthly net cashflow.'
	};
}

/* ------------------------------------------------------------------
   4)  LLM‑FREE WRAPPER  (keeps AppStore API untouched)
------------------------------------------------------------------- */
let lastSig = ''; // cache so we don’t recalc needlessly
let lastResult: Awaited<ReturnType<typeof calculateFinancialSummary>> & {
	anomalies: Awaited<ReturnType<typeof detectAnomalies>>['anomalies'];
	predictions: Awaited<ReturnType<typeof predictFutureTransactions>>;
};

/* ------------------------------------------------------------------
   5)  tiny FNV‑1a hash (32‑bit) — keeps caching constant‑time
------------------------------------------------------------------- */
function fnv1a32(str: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h >>> 0) * 0x01000193;
	}
	return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}
