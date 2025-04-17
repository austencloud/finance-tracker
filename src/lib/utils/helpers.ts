import { categorizeTransaction } from '$lib/services/categorizer';
import type { Transaction, Category } from '$lib/stores/types';

export function generateTransactionId(): number {
	return Date.now() + Math.floor(Math.random() * 10000);
}

export function downloadFile(data: string, filename: string, mimeType: string): void {
	const blob = new Blob([data], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.display = 'none';

	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// WORD‑BASED NUMBER SUPPORT
// ─────────────────────────────────────────────────────────────────────────────

const WORD_NUMBERS = [
	'zero',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'eleven',
	'twelve',
	'thirteen',
	'fourteen',
	'fifteen',
	'sixteen',
	'seventeen',
	'eighteen',
	'nineteen',
	'twenty',
	'thirty',
	'forty',
	'fifty',
	'sixty',
	'seventy',
	'eighty',
	'ninety',
	'hundred',
	'thousand'
];

// Build a regex that matches e.g. “twenty”, “fifteen hundred”, “fifteen‑hundred dollars”
const WORD_NUM_REGEX = new RegExp(
	// match sequences like “fifteen”, “fifteen hundred”, “twenty‑five”, optionally followed by “dollars” or “bucks”
	'\\b(?:' +
		WORD_NUMBERS.join('|') +
		')' +
		'(?:[- ](?:' +
		WORD_NUMBERS.join('|') +
		'))*' +
		'(?:[ -](?:dollars?|bucks?))?\\b',
	'i'
);

export function textLooksLikeTransaction(text: string): boolean {
	const lowerText = text.toLowerCase();

	// 1) Digit‑based amounts: $1234.56, £1234.56, €1234.56, ¥1234.56, etc.
	const hasNumericAmount =
		/[\$\£\€\¥]\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/.test(lowerText) ||
		/\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:dollars?|usd|cad|eur|gbp|bucks?|pounds?|euros?|yen)/.test(
			lowerText
		);

	// 2) Word‑based amounts
	const hasWordAmount = WORD_NUM_REGEX.test(lowerText);

	// 3) Transaction verbs
	const hasKeyword =
		/\b(spent|paid|bought|sold|received|deposit|income|expense|cost|got|transfer|sent|charge|fee|payment|salary|invoice|refund)\b/.test(
			lowerText
		);

	// 4) Date indicators: “yesterday”, “apr”, “04/05/2025”, weekday names, etc.
	const hasDate =
		/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}\b|\b(yesterday|today|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
			lowerText
		);

	return hasNumericAmount || hasWordAmount || (hasKeyword && hasDate);
}

// Example modification (place in a central utils file if used in multiple places)
// src/lib/utils/format.ts (or similar)

export function formatCurrency(
	amount: number | string | null | undefined,
	currencyCode: string = 'USD'
): string {
	const num = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : (amount ?? 0);

	if (isNaN(num)) {
		console.warn(`[formatCurrency] Invalid amount received: ${amount}`);
		// Consider a different fallback for NaN
		return `${currencyCode} ???`;
	}

	try {
		return num.toLocaleString('en-US', {
			// 'en-US' can format most currencies correctly based on code
			style: 'currency',
			currency: currencyCode, // Use the provided currency code
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	} catch (e) {
		// Handle invalid currency codes gracefully
		console.error(
			`[formatCurrency] Error formatting amount ${num} with currency ${currencyCode}:`,
			e
		);
		// Fallback display if toLocaleString fails
		return `${currencyCode} ${num.toFixed(2)}`;
	}
}

// In your components (e.g., ExtractedDataDisplay.svelte):
// Replace: {formatCurrency(txn.amount)}
// With:    {formatCurrency(txn.amount, txn.currency)}
export function fixCommonJsonErrors(jsonStr: string): string {
	if (!jsonStr || typeof jsonStr !== 'string') return '';
	let fixed = jsonStr.trim();

	fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');

	fixed = fixed.replace(/\bNone\b/g, 'null');
	fixed = fixed.replace(/\bTrue\b/g, 'true');
	fixed = fixed.replace(/\bFalse\b/g, 'false');

	try {
		fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
		fixed = fixed.replace(/^\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/, '{"$1"$2');
	} catch (e) {
		console.warn('Regex error during key quoting fix:', e);
	}

	try {
		let prev = '';
		while (prev !== fixed) {
			prev = fixed;
			fixed = fixed.replace(/,\s*([\]}])/g, '$1');
		}
	} catch (e) {
		console.warn('Regex error during trailing comma fix:', e);
	}
	return fixed;
}

export function parseJsonFromAiResponse<T = any>(jsonResponse: string): T | null {
	if (!jsonResponse || typeof jsonResponse !== 'string') {
		return null;
	}
	try {
		return JSON.parse(jsonResponse);
	} catch (e) {
		console.warn('[parseJsonFromAiResponse] Initial JSON parse failed, attempting to fix...');
		try {
			const fixedJson = fixCommonJsonErrors(jsonResponse);
			return JSON.parse(fixedJson);
		} catch (fixError) {
			console.error('[parseJsonFromAiResponse] Failed to parse JSON even after fixing:', fixError);
			return null;
		}
	}
}

export function applyExplicitDirection(
	transactions: Transaction[],
	explicitDirection: 'in' | 'out' | null
): Transaction[] {
	if (!explicitDirection) {
		return transactions.map((txn) => ({ ...txn }));
	}

	return transactions.map((txn) => {
		let updatedTxn = { ...txn };
		if (updatedTxn.direction !== explicitDirection) {
			updatedTxn.direction = explicitDirection;

			if (explicitDirection === 'out') {
				if (updatedTxn.category !== 'Expenses') {
					updatedTxn.category = 'Expenses';
				}
			} else {
				if (updatedTxn.category === 'Expenses') {
					const potentialCategory = categorizeTransaction(updatedTxn.description, updatedTxn.type);
					updatedTxn.category =
						potentialCategory === 'Expenses' ? 'Other / Uncategorized' : potentialCategory;
				}
			}
		}
		return updatedTxn;
	});
}
export function extractCleanJson(raw: string): string | null {
	if (!raw) return null;

	const objectStart = raw.indexOf('{');
	const arrayStart = raw.indexOf('[');
	let start = -1;
	let end = -1;

	if (objectStart !== -1 && arrayStart !== -1) {
		start = Math.min(objectStart, arrayStart);
	} else {
		start = Math.max(objectStart, arrayStart);
	}

	if (start === -1) return null;

	const isArray = raw[start] === '[';
	end = findMatchingCloseBracket(raw, start, isArray ? ']' : '}');

	if (end === -1) {
		end = isArray ? raw.lastIndexOf(']') : raw.lastIndexOf('}');
	}

	if (end <= start) return null;

	let candidate = raw.slice(start, end + 1);

	candidate = candidate.replace(/^\uFEFF/, '');
	candidate = candidate.replace(/\/\/.*?($|\n)/g, '');
	candidate = candidate.replace(/\/\*[\s\S]*?\*\//g, '');
	candidate = candidate.replace(/,\s*([}\]])/g, '$1');
	candidate = candidate.replace(/":\s*unknown\s*,/g, '": "unknown",');

	try {
		JSON.parse(candidate);
		return candidate;
	} catch {
		return null;
	}
}

// Helper function to find the matching closing bracket
function findMatchingCloseBracket(str: string, openPos: number, closeBracket: string): number {
	const openBracket = str[openPos];
	let depth = 1;
	for (let i = openPos + 1; i < str.length; i++) {
		if (str[i] === openBracket) depth++;
		else if (str[i] === closeBracket) depth--;

		if (depth === 0) return i;
	}
	return -1;
}
