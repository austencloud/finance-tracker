// ─────────────────────────  analytics.ts  ─────────────────────────
import type { Transaction } from '$lib/stores/types';

/* ------------------------------------------------------------------
   1)  SUMMARY  ——————————————————————————————————————————————— */
export function calculateFinancialSummary(txns: Transaction[]) {
	// gross figures
	const income = txns
		.filter((t) => t.direction === 'in')
		.reduce((sum, t) => sum + (t.amount ?? 0), 0);

	const expense = txns
		.filter((t) => t.direction === 'out')
		.reduce((sum, t) => sum + (t.amount ?? 0), 0);

	const net = income - expense;
	const savingsRate = income === 0 ? 0 : +(100 * (net / income)).toFixed(1);

	// by‑category breakdown (positive for income, negative for outflow)
	const byCategory: Record<string, number> = {};
	for (const t of txns) {
		if (!t.category) continue;
		const amt = (t.direction === 'out' ? -1 : 1) * (t.amount ?? 0);
		byCategory[t.category] = (byCategory[t.category] ?? 0) + amt;
	}

	// simple month‑over‑month cash‑flow trend
	const byMonth: Record<string, number> = {};
	for (const t of txns) {
		const [y, m] = t.date.split('-'); // YYYY‑MM‑DD
		const bucket = `${y}-${m}`; // YYYY‑MM
		const amt = (t.direction === 'out' ? -1 : 1) * (t.amount ?? 0);
		byMonth[bucket] = (byMonth[bucket] ?? 0) + amt;
	}

	return {
		income,
		expense,
		net,
		savingsRate, // %
		byCategory, // { Grocery: -123.45, Salary: 2000 … }
		byMonth // { '2025‑04': 1500, '2025‑05': -200 … }
	};
}

/* ------------------------------------------------------------------
   2)  ANOMALIES  (very lightweight heuristic)
       A transaction is “large” if it’s > 3× its category’s median.
------------------------------------------------------------------- */
export function detectAnomalies(txns: Transaction[]) {
	const grouped: Record<string, number[]> = {};
	for (const t of txns) {
		if (!t.category || t.amount == null) continue;
		(grouped[t.category] ??= []).push(Math.abs(t.amount));
	}

	const med = (arr: number[]) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)] ?? 0;

	const medians: Record<string, number> = {};
	for (const c in grouped) medians[c] = med(grouped[c]);

	const anomalies = txns.filter((t) => {
		const base = medians[t.category ?? ''];
		return base > 0 && Math.abs(t.amount ?? 0) > 3 * base;
	});

	return { anomalies };
}

/* ------------------------------------------------------------------
   3)  “PREDICTION”  (naïve average monthly cash‑flow projection)
------------------------------------------------------------------- */
export function predictFutureTransactions(txns: Transaction[]) {
	if (txns.length === 0) return null;

	// bucket by month → total cash‑flow
	const buckets: Record<string, number> = {};
	for (const t of txns) {
		const key = t.date.slice(0, 7); // YYYY‑MM
		const amt = (t.direction === 'out' ? -1 : 1) * (t.amount ?? 0);
		buckets[key] = (buckets[key] ?? 0) + amt;
	}

	const monthlyTotals = Object.values(buckets);
	if (monthlyTotals.length < 2) return null; // nothing to extrapolate

	const avg = +(monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length).toFixed(2);

	return { projectedMonthlyNet: avg };
}

/* ------------------------------------------------------------------
   4)  LLM‑FREE WRAPPER  (keeps AppStore API untouched)
------------------------------------------------------------------- */
let lastSig = ''; // cache so we don’t recalc needlessly
let lastResult: ReturnType<typeof calculateFinancialSummary> & {
	anomalies: ReturnType<typeof detectAnomalies>['anomalies'];
	predictions: ReturnType<typeof predictFutureTransactions>;
};

export async function getLLMAnalysis(txns: Transaction[]) {
	// cheap hash so we don’t redo work if nothing changed
	const sig = fnv1a32(JSON.stringify(txns));
	if (sig === lastSig && lastResult) return lastResult;

	const summary = calculateFinancialSummary(txns);
	const anomalies = detectAnomalies(txns).anomalies;
	const predictions = predictFutureTransactions(txns);

	lastSig = sig;
	lastResult = { ...summary, anomalies, predictions };
	return lastResult;
}

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
