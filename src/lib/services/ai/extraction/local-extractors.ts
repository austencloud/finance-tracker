// src/lib/services/ai/extraction/local-extractors.ts

import { v4 as uuidv4 } from 'uuid';
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '../../categorizer';
import type { Transaction } from '$lib/types/types';
// Add this helper function at the top of the file (after imports)
/**
 * Processes currency symbols in description and amount
 * @param description The transaction description text
 * @param amount The detected amount
 * @returns Object with processed description and amount
 */
function processCurrency(
	description: string,
	amount: number
): { description: string; amount: number } {
	// Check for foreign currency symbols in the description
	const currencySymbols = {
		'¥': 'JPY',
		'€': 'EUR',
		'£': 'GBP',
		'₹': 'INR',
		'₩': 'KRW'
		// Add more currencies as needed
	};

	// Check if any currency symbol is present in the description
	let foreignCurrency = null;
	for (const [symbol, code] of Object.entries(currencySymbols)) {
		if (description.includes(symbol)) {
			foreignCurrency = { symbol, code };
			break;
		}
	}

	// If we found a foreign currency, add it to the description
	if (foreignCurrency) {
		// Don't convert the amount, but note the currency in the description
		const updatedDesc = description.includes(foreignCurrency.code)
			? description
			: `${description} (${foreignCurrency.code})`;

		return {
			description: updatedDesc,
			amount: amount // Keep the original amount value
		};
	}

	return { description, amount };
}

// --- textContainsTransactionPatterns function (keep as is) ---
export function textContainsTransactionPatterns(text: string): boolean {
	const patterns = [
		/\$\s*[\d,]+\.\d{2}/,
		/\b\d+\.\d{2}\s*(dollars|USD|EUR)\b/i,
		/\b(spent|paid|purchased|bought|received|earned|deposited|withdrew|transfer|charge|refund|credit|debit)\b/i,
		/\b(paypal|venmo|zelle|bank|credit card|debit card|ach|check|wire|coinbase)\b/i,
		/\b(balance|available|transaction|statement|account)\b/i,
		/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/i,
		/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/
	];
	return patterns.some((pattern) => pattern.test(text));
}

// --- extractBankStatementFormat function (SIGNATURE UPDATED) ---
// Make sure you update this function as shown previously to accept and use batchId
export function extractBankStatementFormat(text: string, batchId: string): Transaction[] {
	console.log(
		`[extractBankStatementFormat] Parsing specific bank statement format for batch ${batchId}`
	);
	const detectedTransactions: Transaction[] = [];
	const dateHeaderPattern =
		/^\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})|(?:\d{1,2}\/\d{1,2}\/\d{4})$/m;
	const allLines = text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const transactionStartIndices: number[] = [];
	allLines.forEach((line, index) => {
		if (dateHeaderPattern.test(line)) {
			transactionStartIndices.push(index);
		}
	});

	for (let i = 0; i < transactionStartIndices.length; i++) {
		const startIdx = transactionStartIndices[i];
		const endIdx =
			i < transactionStartIndices.length - 1 ? transactionStartIndices[i + 1] : allLines.length;
		const transactionLines = allLines.slice(startIdx, endIdx);

		if (transactionLines.length < 3) continue; // Basic validation

		try {
			// Wrap extraction in try/catch per block
			const date = resolveAndFormatDate(transactionLines[0]);
			if (date === 'unknown') continue;

			let amount = 0;
			let amountLineIndex = -1;
			for (let j = transactionLines.length - 1; j >= 1; j--) {
				const amountMatch = transactionLines[j].match(/^\$\s*([\d,]+\.\d{2})/);
				if (amountMatch) {
					amount = parseFloat(amountMatch[1].replace(/,/g, ''));
					amountLineIndex = j;
					break;
				}
			}
			if (amount <= 0 || amountLineIndex === -1) continue;

			let type = 'unknown';
			const potentialTypeLineIndex = amountLineIndex - 1;
			if (potentialTypeLineIndex >= 1) {
				const potentialTypeLine = transactionLines[potentialTypeLineIndex];
				const typePatterns =
					/^\s*(ACH credit|Zelle credit|Card|Deposit|ATM transaction|Other|ACH debit|Check Card|Payment|Withdrawal|Cash Redemption)/i;
				const typeMatch = potentialTypeLine.match(typePatterns);
				if (typeMatch) type = typeMatch[0].trim();
			}
			if (type === 'unknown') {
				/* ... type inference logic ... */
				const allText = transactionLines.join(' ').toLowerCase();
				if (allText.includes('paypal')) type = 'PayPal';
				else if (allText.includes('zelle')) type = 'Zelle';
				else if (allText.includes('ach')) type = 'ACH';
				else if (allText.includes('card')) type = 'Card';
				else if (allText.includes('deposit')) type = 'Deposit';
				else if (allText.includes('atm')) type = 'ATM';
				else if (allText.includes('withdrawal')) type = 'Withdrawal';
				else if (allText.includes('payment')) type = 'Payment';
				else if (allText.includes('venmo')) type = 'Venmo';
			}

			const descriptionEndIndex =
				type !== 'unknown' && potentialTypeLineIndex >= 1
					? potentialTypeLineIndex
					: amountLineIndex;
			const descriptionLines = transactionLines.slice(1, descriptionEndIndex);
			let description = descriptionLines.join(' ').trim() || 'unknown';
			/* ... description refinement logic ... */
			const lowerDesc = description.toLowerCase();
			if (
				lowerDesc.includes('payment from') ||
				lowerDesc.includes('paypal') ||
				lowerDesc.includes('coinbase') ||
				lowerDesc.includes('venmo') ||
				lowerDesc.includes('sparkles')
			) {
				const specificLine = descriptionLines.find(
					(l) =>
						l.toLowerCase().includes('payment from') ||
						l.toLowerCase().includes('paypal') ||
						l.toLowerCase().includes('coinbase') ||
						l.toLowerCase().includes('venmo') ||
						l.toLowerCase().includes('sparkles')
				);
				if (specificLine) description = specificLine.trim();
			}

			let direction: 'in' | 'out' | 'unknown' = 'unknown';
			/* ... direction inference logic ... */
			const combinedTextForDirection = (description + ' ' + type).toLowerCase();
			if (
				combinedTextForDirection.includes('credit') ||
				combinedTextForDirection.includes('deposit') ||
				combinedTextForDirection.includes('payment from') ||
				combinedTextForDirection.includes('received') ||
				combinedTextForDirection.includes('cashout') ||
				description.toLowerCase().includes('sparkles enterta payroll')
			) {
				direction = 'in';
			} else if (
				combinedTextForDirection.includes('debit') ||
				combinedTextForDirection.includes('withdrawal') ||
				combinedTextForDirection.includes('payment to') ||
				combinedTextForDirection.includes('purchase') ||
				combinedTextForDirection.includes('bought') ||
				combinedTextForDirection.includes('charge') ||
				(combinedTextForDirection.includes('payment') &&
					!combinedTextForDirection.includes('payment from')) ||
				type.toLowerCase() === 'card' ||
				type.toLowerCase() === 'check card'
			) {
				direction = 'out';
			} else if (
				type.toLowerCase() === 'atm transaction' ||
				type.toLowerCase() === 'cash redemption'
			) {
				direction = 'unknown';
			} else {
				direction = 'unknown';
			}

			const transaction: Transaction = {
				id: uuidv4(),
				batchId: batchId, // <-- Assign batchId
				date: date,
				description: description,
				type: type,
				amount: amount,
				category: 'Other / Uncategorized', // Assign initial default category
				notes: '',
				direction: direction
			};

			transaction.category = categorizeTransaction(transaction.description, transaction.type);
			if (transaction.direction === 'out' && transaction.category === 'Other / Uncategorized') {
				transaction.category = 'Expenses';
			} else if (transaction.direction === 'in' && transaction.category === 'Expenses') {
				transaction.category = categorizeTransaction(transaction.description, transaction.type);
			}

			detectedTransactions.push(transaction);
		} catch (error) {
			console.error(
				`[extractBankStatementFormat] Error processing block for batch ${batchId}:`,
				error
			);
		}
	}
	// ... (rest of function)
	console.log(
		`[extractBankStatementFormat] Finished batch ${batchId}. Extracted ${detectedTransactions.length} transactions.`
	);
	return detectedTransactions;
}

// --- extractConversationalTransactions function (SIGNATURE UPDATED) ---
// Make sure you update this function as shown previously to accept and use batchId
export function extractConversationalTransactions(
	text: string,
	todayDate: string,
	batchId: string
): Transaction[] {
	console.log(`[extractConversational] Parsing conversational text for batch ${batchId}`);
	const transactions: Transaction[] = [];
	// ... (regex patterns, date handling logic remain the same) ...
	const lowerText = text.toLowerCase();
	const patterns = [
		{
			regex:
				/\b(?:I|we)\s+(?:spent|paid|bought)\s+\$?([\d,]+\.?\d*)\s+(?:on|for)\s+([^.,\n]+?)(?:\s+(?:on|last|this)?\s*(yesterday|today|\w+day|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?))?/gi,
			process: (match: RegExpExecArray) => {
				const amount = parseFloat(match[1].replace(/,/g, ''));
				const description = match[2].trim();
				const dateContext = match[3] ? match[3].trim() : null;
				return { amount, description, dateContext, direction: 'out' as const };
			}
		},
		{
			regex:
				/\b(?:I|we)\s+(?:got|received|earned)\s+\$?([\d,]+\.?\d*)\s+(?:from|for)\s+([^.,\n]+?)(?:\s+(?:on|last|this)?\s*(yesterday|today|\w+day|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?))?/gi,
			process: (match: RegExpExecArray) => {
				const amount = parseFloat(match[1].replace(/,/g, ''));
				const description = match[2].trim();
				const dateContext = match[3] ? match[3].trim() : null;
				return { amount, description, dateContext, direction: 'in' as const };
			}
		},
		{
			regex:
				/\$?([\d,]+\.?\d*)\s+(?:for|on)\s+([^.,\n]+?)(?:\s+(?:on|last|this)?\s*(yesterday|today|\w+day|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?))?/gi,
			process: (match: RegExpExecArray) => {
				if (lowerText.includes(`spent ${match[0]}`) || lowerText.includes(`paid ${match[0]}`)) {
					return null;
				}
				const amount = parseFloat(match[1].replace(/,/g, ''));
				const description = match[2].trim();
				const dateContext = match[3] ? match[3].trim() : null;
				return { amount, description, dateContext, direction: 'out' as const };
			}
		}
	];
	let generalDate = todayDate;
	const generalDateMatch = text.match(
		/\b(?:on|last|this)?\s*(yesterday|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)\b/i
	);
	if (generalDateMatch) {
		const resolvedGeneral = resolveAndFormatDate(generalDateMatch[0]);
		if (resolvedGeneral !== 'unknown') {
			generalDate = resolvedGeneral;
		}
	}

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.regex.exec(text)) !== null) {
			const result = pattern.process(match);
			if (!result) continue;
			const { amount, description, dateContext, direction } = result;

			if (!isNaN(amount) && amount > 0) {
				let transactionDate = generalDate;
				if (dateContext) {
					const resolvedSpecific = resolveAndFormatDate(dateContext);
					if (resolvedSpecific !== 'unknown') {
						transactionDate = resolvedSpecific;
					}
				}
				let type = 'unknown'; /* ... type inference ... */
				const descLower = description.toLowerCase();
				if (
					descLower.includes('card') ||
					descLower.includes('credit') ||
					descLower.includes('debit')
				)
					type = 'Card';
				else if (descLower.includes('cash')) type = 'Cash';
				else if (
					descLower.includes('paypal') ||
					descLower.includes('venmo') ||
					descLower.includes('zelle')
				)
					type = 'Transfer';
				else if (descLower.includes('check')) type = 'Check';
				const category = categorizeTransaction(description, type);
				const finalCategory =
					direction === 'out' && category === 'Other / Uncategorized' ? 'Expenses' : category;

				const { description: processedDesc, amount: processedAmount } = processCurrency(
					description,
					amount
				);

				transactions.push({
					id: uuidv4(),
					batchId: batchId,
					date: transactionDate,
					description: processedDesc, // Use processed description with currency info
					type: type,
					amount: processedAmount, // Use processed amount
					category: finalCategory,
					notes: '',
					direction: direction
				});
			}
		}
	}
	console.log(
		`[extractConversational] Finished batch ${batchId}. Extracted ${transactions.length} transactions.`
	);
	return transactions;
}

// --- Updated enhancedLocalExtraction function ---
/**
 * A higher-level local extraction function that orchestrates different extraction methods.
 * It first attempts the highly specific `extractBankStatementFormat`. If that yields no results,
 * it falls back to `extractConversationalTransactions`. More methods could be added here.
 *
 * @param text The input text to extract transactions from.
 * @param todayDate Today's date in 'YYYY-MM-DD' format.
 * @param batchId A unique identifier for this extraction batch.
 * @returns An array of extracted Transaction objects.
 */
export function enhancedLocalExtraction(
	text: string,
	todayDate: string,
	batchId: string
): Transaction[] {
	console.log(`[enhancedLocalExtraction] Running enhanced local extraction for batch ${batchId}`);

	// --- Method 1: Prioritize the Specific Bank Statement Format ---
	try {
		// Pass batchId down
		const bankStatementTransactions = extractBankStatementFormat(text, batchId);
		if (bankStatementTransactions.length > 0) {
			console.log(
				`[enhancedLocalExtraction] Extracted ${bankStatementTransactions.length} via bank format for batch ${batchId}.`
			);
			return bankStatementTransactions;
		}
		console.log(
			`[enhancedLocalExtraction] Bank format extractor found 0 for batch ${batchId}, trying conversational.`
		);
	} catch (error) {
		console.error(
			`[enhancedLocalExtraction] Error in bank format extraction for batch ${batchId}:`,
			error
		);
	}

	// --- Method 2: Fallback to Conversational Extraction ---
	try {
		// Pass batchId down
		const conversationalTransactions = extractConversationalTransactions(text, todayDate, batchId);
		if (conversationalTransactions.length > 0) {
			console.log(
				`[enhancedLocalExtraction] Extracted ${conversationalTransactions.length} via conversational for batch ${batchId}.`
			);
			return conversationalTransactions;
		}
		console.log(`[enhancedLocalExtraction] Conversational extractor found 0 for batch ${batchId}.`);
	} catch (error) {
		console.error(
			`[enhancedLocalExtraction] Error in conversational extraction for batch ${batchId}:`,
			error
		);
	}

	console.log(
		`[enhancedLocalExtraction] No transactions found by any local method for batch ${batchId}.`
	);
	return [];
}
