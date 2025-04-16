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

export function textLooksLikeTransaction(text: string): boolean {
	const lowerText = text.toLowerCase();

	const hasAmount =
		/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/i.test(lowerText) ||
		/\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|usd|cad|eur|gbp|bucks?)/i.test(lowerText) ||
		/\b\d+\b/.test(lowerText) ||
		/\b(a|one)\s+(dollar|buck)\b/i.test(lowerText);

	const hasKeyword =
		/\b(spent|paid|bought|sold|received|deposit|income|expense|cost|got|transfer|sent|charge|fee|payment|salary|invoice|refund)\b/i.test(
			lowerText
		);

	const hasDate =
		/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}|\b(yesterday|today|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
			lowerText
		);

	return hasAmount || (hasKeyword && hasDate);
}

export function formatCurrency(amount: number): string {
	if (typeof amount !== 'number' || isNaN(amount)) {
		return '$0.00';
	}
	return `$${amount.toFixed(2)}`;
}

export function fixCommonJsonErrors(jsonStr: string): string {
	if (!jsonStr || typeof jsonStr !== 'string') return '';
	let fixed = jsonStr.trim();

	fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');

	fixed = fixed.replace(/\bNone\b/g, 'null');
	fixed = fixed.replace(/\bTrue\b/g, 'true');
	fixed = fixed.replace(/\bFalse\b/g, 'false');

	try {
		fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

		fixed = fixed.replace(/^\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '{\"$1\"$2');
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
			} else if (explicitDirection === 'in') {
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
