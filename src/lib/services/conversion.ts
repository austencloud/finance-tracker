// src/lib/services/conversion.ts
import { BASE_CURRENCY } from '$lib/config/constants';
import type { Transaction } from '$lib/stores/types'; // Make sure Transaction type is imported

// Assume rateCache and API fetching logic for getConversionRate is here...
const rateCache = new Map<string, { rate: number; timestamp: number }>();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

export async function getConversionRate(
	fromCurrency: string,
	toCurrency: string, // Usually your base currency, e.g., "USD"
	date: string // Expecting "YYYY-MM-DD"
): Promise<number | null> {
	if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return 1.0;
	if (date === 'unknown' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

	const cacheKey = `${fromCurrency.toUpperCase()}-${toCurrency.toUpperCase()}-${date}`;
	const cached = rateCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
		return cached.rate;
	}

	console.log(`[Conversion] Fetching rate for ${cacheKey} - (IMPLEMENT API CALL)`);
	// !!! --- TODO: Implement actual API call logic here --- !!!
	// Replace this placeholder with calls to fetchFiatRate/fetchCryptoRate
	let rate: number | null = null;
	await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate async call
	if (fromCurrency === 'JPY' && toCurrency === 'USD')
		rate = 0.007; // Dummy data
	else if (fromCurrency === 'BTC' && toCurrency === 'USD')
		rate = 50000; // Dummy data
	else if (fromCurrency === 'ETH' && toCurrency === 'USD') rate = 3000; // Dummy data

	if (rate !== null) {
		rateCache.set(cacheKey, { rate, timestamp: Date.now() });
	} else {
		console.error(`[getConversionRate] Failed to get rate for ${cacheKey}`);
	}
	return rate;
}

// *** Moved from analytics.ts and Exported ***
export async function getAmountInBase(txn: Transaction): Promise<number | null> {
	if (txn.amount == null || txn.date === 'unknown' || !/^\d{4}-\d{2}-\d{2}$/.test(txn.date)) {
		return null;
	}
	const fromCurrencyUpper = txn.currency.toUpperCase();
	const baseCurrencyUpper = BASE_CURRENCY.toUpperCase();

	if (fromCurrencyUpper === baseCurrencyUpper) {
		return txn.amount;
	}

	// Call getConversionRate (defined above)
	const rate = await getConversionRate(fromCurrencyUpper, baseCurrencyUpper, txn.date);
	if (rate === null) {
		// Warning moved to caller context for better debugging
		// console.warn(`Conversion Service: Could not get rate...`);
		return null;
	}
	return txn.amount * rate;
}
