// src/utils/conversation.utils.ts

/**
 * Basic heuristic check if a string looks like it might contain transaction data.
 * @param text - The input string.
 * @returns True if the text might contain transaction data, false otherwise.
 */
export function userInputLooksLikeTransaction(text: string): boolean {
	const lowerText = text.toLowerCase();
	// Look for currency symbols OR numbers
	const hasAmount =
		/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd|cad|eur|gbp)/i.test(
			lowerText
		) || /\b\d+\b/.test(lowerText);
	// Look for action keywords
	const hasKeyword =
		/\b(spent|paid|bought|sold|received|deposit|income|expense|cost|got|transfer|sent|charge|fee|payment|salary|invoice|refund)\b/i.test(
			lowerText
		);
	// Look for date-related keywords/formats
	const hasDate =
		/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}|\b(yesterday|today|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
			lowerText
		);

	// Require an amount OR (a keyword AND a date) for it to look plausible
	const looksLike = hasAmount || (hasKeyword && hasDate);
	console.log(
		`[userInputLooksLikeTransaction] Input: "${text.substring(0, 50)}...", Result: ${looksLike}`
	);
	return looksLike;
}
