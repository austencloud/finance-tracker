// src/lib/services/ai/extraction/local-extractors.ts
import type { Transaction, Category } from '$lib/types'; // Assuming Transaction type is defined here or imported
// import { generateTransactionId } from '$lib/utils/helpers'; // Using UUID now
import { v4 as uuidv4 } from 'uuid'; // Import UUID
import { resolveAndFormatDate } from '$lib/utils/date'; // Helper for parsing and formatting dates
import { categorizeTransaction } from '../../categorizer'; // Helper for assigning categories (Adjust path as needed)

/**
 * Quickly checks if a given text string contains common patterns
 * that suggest the presence of financial transaction details.
 * This helps decide if more complex extraction logic should be run.
 *
 * @param text The input text to scan.
 * @returns True if transaction-like patterns are found, false otherwise.
 */
export function textContainsTransactionPatterns(text: string): boolean {
	// Define regular expressions for common financial patterns
	const patterns = [
		// Money amounts (e.g., $10.00, $ 1,234.56, 50.00 dollars)
		/\$\s*[\d,]+\.\d{2}/,
		/\b\d+\.\d{2}\s*(dollars|USD|EUR)\b/i,

		// Common transaction verbs (e.g., spent, paid, received, deposited)
		/\b(spent|paid|purchased|bought|received|earned|deposited|withdrew|transfer|charge|refund|credit|debit)\b/i,

		// Names of financial institutions or payment services (e.g., paypal, bank, credit card)
		/\b(paypal|venmo|zelle|bank|credit card|debit card|ach|check|wire|coinbase)\b/i,

		// Keywords often found in bank statements (e.g., balance, transaction, account)
		/\b(balance|available|transaction|statement|account)\b/i,

		// Common date patterns
		/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/i,
		/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/
	];

	// Check if *any* of the defined patterns match the input text
	// The `some` method returns true as soon as one pattern matches
	return patterns.some((pattern) => pattern.test(text));
}

/**
 * Extracts transactions from text formatted like a specific bank statement structure.
 * This function is optimized for a format where each transaction block typically starts
 * with a date, followed by description lines, an optional type line, and an amount line.
 *
 * @param text The bank statement text, potentially containing multiple transactions.
 * @returns An array of extracted Transaction objects.
 */
export function extractBankStatementFormat(text: string): Transaction[] {
	console.log('[extractBankStatementFormat] Parsing specific bank statement format');
	const detectedTransactions: Transaction[] = [];

	// Regex to identify lines that likely represent transaction dates
	// `m` flag allows `^` to match the start of each line
	// *** FIX: Allow optional leading whitespace with \s* ***
	const dateHeaderPattern =
		/^\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})|(?:\d{1,2}\/\d{1,2}\/\d{4})$/m;

	// Split the input text into lines, trim whitespace, and remove empty lines
	const allLines = text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	// Find the indices of lines that match the date pattern, marking potential transaction starts
	const transactionStartIndices: number[] = [];
	allLines.forEach((line, index) => {
		if (dateHeaderPattern.test(line)) {
			console.log(
				`[extractBankStatementFormat] Found potential start date at index ${index}: "${line}"`
			);
			transactionStartIndices.push(index);
		}
	});

	console.log(
		`[extractBankStatementFormat] Found ${transactionStartIndices.length} potential transaction start dates`
	);

	// Iterate through the identified potential transaction blocks
	for (let i = 0; i < transactionStartIndices.length; i++) {
		const blockNumber = i + 1;
		try {
			// Determine the start and end lines for the current transaction block
			const startIdx = transactionStartIndices[i];
			// The end index is the start of the next transaction, or the end of the text if it's the last one
			const endIdx =
				i < transactionStartIndices.length - 1 ? transactionStartIndices[i + 1] : allLines.length;
			const transactionLines = allLines.slice(startIdx, endIdx);

			console.log(
				`[extractBankStatementFormat] Processing block ${blockNumber} (lines ${startIdx}-${endIdx - 1}):`,
				transactionLines
			);

			// Basic validation: A transaction block needs at least a date, description/type, and amount line
			if (transactionLines.length < 3) {
				console.log(
					`[extractBankStatementFormat] Block ${blockNumber} too short, skipping:`,
					transactionLines.join(' ') // Log the skipped lines for debugging
				);
				continue; // Move to the next potential transaction
			}

			// --- Extraction Steps ---

			// 1. Extract Date: The first line of the block is assumed to be the date
			const date = resolveAndFormatDate(transactionLines[0]); // Use helper to parse various date formats
			if (date === 'unknown') {
				console.log(
					`[extractBankStatementFormat] Block ${blockNumber}: Could not parse date, skipping block starting with:`,
					transactionLines[0]
				);
				continue; // Skip if date parsing fails
			}

			// 2. Extract Amount: Search *backwards* from the end of the block for a line starting with '$'
			let amount = 0;
			let amountLineIndex = -1; // Store the index of the line where the amount was found
			for (let j = transactionLines.length - 1; j >= 1; j--) {
				// Start from second-to-last line
				const line = transactionLines[j];
				// Regex: ^ asserts start of line, \$ matches literal $, \s* allows optional space,
				// ([\d,]+\.\d{2}) captures digits, commas, and required decimal part
				const amountMatch = line.match(/^\$\s*([\d,]+\.\d{2})/);
				if (amountMatch) {
					// If matched, parse the captured amount (remove commas first)
					amount = parseFloat(amountMatch[1].replace(/,/g, ''));
					amountLineIndex = j;
					break; // Stop searching once the amount is found
				}
			}

			// Validation: Amount must be found and be greater than zero
			if (amount <= 0 || amountLineIndex === -1) {
				console.log(
					`[extractBankStatementFormat] Block ${blockNumber}: No valid amount line found, skipping block:`,
					transactionLines.join(' ')
				);
				continue;
			}

			// 3. Extract Type: Assume the line *immediately before* the amount line might be the transaction type
			let type = 'unknown';
			const potentialTypeLineIndex = amountLineIndex - 1;
			if (potentialTypeLineIndex >= 1) {
				// Ensure the index is valid (at least the second line)
				const potentialTypeLine = transactionLines[potentialTypeLineIndex];
				// Regex to match common transaction type keywords at the start of the line
				// Made case-insensitive and allowed optional whitespace
				const typePatterns =
					/^\s*(ACH credit|Zelle credit|Card|Deposit|ATM transaction|Other|ACH debit|Check Card|Payment|Withdrawal|Cash Redemption)/i;
				const typeMatch = potentialTypeLine.match(typePatterns);
				if (typeMatch) {
					type = typeMatch[0].trim(); // Use the matched text as the type
				}
			}
			// Fallback/Infer Type: If no explicit type line was found, try inferring from keywords in the block
			if (type === 'unknown') {
				const allText = transactionLines.join(' ').toLowerCase(); // Combine lines for easier searching
				if (allText.includes('paypal')) type = 'PayPal';
				else if (allText.includes('zelle')) type = 'Zelle';
				else if (allText.includes('ach')) type = 'ACH';
				else if (allText.includes('card')) type = 'Card';
				else if (allText.includes('deposit')) type = 'Deposit';
				else if (allText.includes('atm')) type = 'ATM';
				else if (allText.includes('withdrawal')) type = 'Withdrawal';
				else if (allText.includes('payment')) type = 'Payment';
				else if (allText.includes('venmo')) type = 'Venmo';
				// If still unknown, it remains 'unknown'
			}

			// 4. Extract Description: Combine the lines *between* the date line (index 0) and the type/amount lines
			// If a type line was found, stop before it; otherwise, stop before the amount line.
			const descriptionEndIndex =
				type !== 'unknown' && potentialTypeLineIndex >= 1
					? potentialTypeLineIndex
					: amountLineIndex;
			const descriptionLines = transactionLines.slice(1, descriptionEndIndex);
			let description = descriptionLines.join(' ').trim() || 'unknown'; // Join lines and provide default

			// Refine Description: For certain known patterns (e.g., Zelle payments), try to find a more specific line
			// within the description lines, as sometimes the bank adds extra generic lines.
			const lowerDesc = description.toLowerCase();
			if (
				lowerDesc.includes('payment from') || // Zelle income often contains this
				lowerDesc.includes('paypal') ||
				lowerDesc.includes('coinbase') ||
				lowerDesc.includes('venmo') ||
				lowerDesc.includes('sparkles') // Example specific merchant/source
			) {
				// Find the first description line containing one of these keywords
				const specificLine = descriptionLines.find(
					(l) =>
						l.toLowerCase().includes('payment from') ||
						l.toLowerCase().includes('paypal') ||
						l.toLowerCase().includes('coinbase') ||
						l.toLowerCase().includes('venmo') ||
						l.toLowerCase().includes('sparkles')
				);
				// Use the more specific line if found, otherwise keep the combined one
				if (specificLine) description = specificLine.trim();
			}

			// 5. Determine Direction (Income 'in' or Expense 'out'):
			let direction: 'in' | 'out' | 'unknown' = 'unknown';
			const combinedTextForDirection = (description + ' ' + type).toLowerCase();

			// Keywords indicating income
			if (
				combinedTextForDirection.includes('credit') ||
				combinedTextForDirection.includes('deposit') ||
				combinedTextForDirection.includes('payment from') || // Common in Zelle income descriptions
				combinedTextForDirection.includes('received') ||
				combinedTextForDirection.includes('cashout') || // Venmo cashout
				description.toLowerCase().includes('sparkles enterta payroll') // Example specific income source
			) {
				direction = 'in';
				// Keywords indicating expense
			} else if (
				combinedTextForDirection.includes('debit') || // Explicit debit
				combinedTextForDirection.includes('withdrawal') ||
				combinedTextForDirection.includes('payment to') || // Common in Zelle expense descriptions
				combinedTextForDirection.includes('purchase') ||
				combinedTextForDirection.includes('bought') ||
				combinedTextForDirection.includes('charge') ||
				(combinedTextForDirection.includes('payment') &&
					!combinedTextForDirection.includes('payment from')) || // Payment unless "from"
				type.toLowerCase() === 'card' || // Explicit type check
				type.toLowerCase() === 'check card' // Explicit type check
			) {
				direction = 'out';
			} else if (
				type.toLowerCase() === 'atm transaction' ||
				type.toLowerCase() === 'cash redemption'
			) {
				// These are ambiguous without more context (could be deposit or withdrawal)
				direction = 'unknown';
				console.warn(
					`[extractBankStatementFormat] Block ${blockNumber}: Ambiguous direction for type "${type}". Setting to unknown.`
				);
			} else {
				// Default Guess Removed: If keywords are ambiguous, leave as unknown
				direction = 'unknown';
				console.warn(
					`[extractBankStatementFormat] Block ${blockNumber}: Uncertain direction for: ${description} / ${type}. Setting to unknown.`
				);
			}

			// 6. Create Transaction Object: Assemble the extracted data
			// Ensure amount is stored as a number (it should already be a number from parsing)
			const numericAmount = amount; // Amount is already parsed as a number

			const transaction: Transaction = {
				// id: generateTransactionId(), // Generate a unique ID - Switched to UUID
				id: uuidv4(), // Use UUID v4 for unique string IDs
				date: date,
				description: description,
				type: type,
				amount: numericAmount, // Store as number
				category: 'Other / Uncategorized', // Assign an initial default category
				notes: '', // Initialize notes as empty
				direction: direction // Can be 'in', 'out', or 'unknown'
			};

			// 7. Categorize Transaction: Use the helper function to assign a category based on description/type
			transaction.category = categorizeTransaction(transaction.description, transaction.type);
			// If direction is 'out', ensure category is 'Expenses' unless already specific
			if (transaction.direction === 'out' && transaction.category === 'Other / Uncategorized') {
				transaction.category = 'Expenses';
			} else if (transaction.direction === 'in' && transaction.category === 'Expenses') {
				// Correct category if direction is IN but category defaulted to Expenses
				transaction.category = categorizeTransaction(transaction.description, transaction.type); // Re-run or set default
			}

			// Add the completed transaction to the results array
			detectedTransactions.push(transaction);
			console.log(
				`[extractBankStatementFormat] Added Block ${blockNumber}: ${date} | ${description} | ${type} | ${numericAmount} | ${direction} | ${transaction.category}`
			);
		} catch (error) {
			// Catch errors during the processing of a single block to prevent crashing the whole extraction
			console.error(`[extractBankStatementFormat] Error processing block ${blockNumber}:`, error);
		}
	}

	console.log(
		`[extractBankStatementFormat] Finished. Extracted ${detectedTransactions.length} transactions.`
	);
	return detectedTransactions; // Return the array of successfully extracted transactions
}

// --- NOTE: UUID Change ---
// Using uuidv4() means the Transaction type definition needs to change:
// export interface Transaction {
//   id: string; // Changed from number
//   // ... rest of fields
// }
// This change needs to be made in src/lib/types/transaction.ts
// and potentially anywhere else that assumes id is a number (e.g., sorting, comparisons).
// For now, I've added the uuid import and usage, but the type change is external to this file.

/**
 * A higher-level local extraction function that orchestrates different extraction methods.
 * It first attempts the highly specific `extractBankStatementFormat`. If that yields no results,
 * it falls back to `extractConversationalTransactions`. More methods could be added here.
 *
 * @param text The input text to extract transactions from.
 * @param todayDate Today's date in 'YYYY-MM-DD' format, used as a fallback for conversational parsing.
 * @returns An array of extracted Transaction objects.
 */
export function enhancedLocalExtraction(text: string, todayDate: string): Transaction[] {
	console.log('[enhancedLocalExtraction] Running enhanced local extraction');

	// --- Method 1: Prioritize the Specific Bank Statement Format ---
	try {
		const bankStatementTransactions = extractBankStatementFormat(text);
		// If the specific parser found transactions, assume it's the correct format and return them
		if (bankStatementTransactions.length > 0) {
			console.log(
				`[enhancedLocalExtraction] Extracted ${bankStatementTransactions.length} via bank format extractor.`
			);
			return bankStatementTransactions;
		}
		// Log if the specific parser found nothing, indicating a fallback is needed
		console.log(
			'[enhancedLocalExtraction] Bank format extractor found 0 transactions, trying conversational.'
		);
	} catch (error) {
		// Log errors from the specific parser but continue to try other methods
		console.error('[enhancedLocalExtraction] Error in bank format extraction:', error);
	}

	// --- Method 2: Fallback to Conversational Extraction ---
	// If the specific format didn't match or errored, try parsing more natural language inputs.
	try {
		const conversationalTransactions = extractConversationalTransactions(text, todayDate);
		// If the conversational parser found transactions, return those
		if (conversationalTransactions.length > 0) {
			console.log(
				`[enhancedLocalExtraction] Extracted ${conversationalTransactions.length} via conversational extractor.`
			);
			return conversationalTransactions;
		}
		// Log if the conversational parser also found nothing
		console.log('[enhancedLocalExtraction] Conversational extractor found 0 transactions.');
	} catch (error) {
		// Log errors from the conversational parser
		console.error('[enhancedLocalExtraction] Error in conversational extraction:', error);
	}

	// If no methods found any transactions, return an empty array
	console.log('[enhancedLocalExtraction] No transactions found by any local method.');
	return [];
}

/**
 * Extracts transactions from less structured, conversational text.
 * Looks for patterns like "I spent $20 on lunch yesterday" or "Received $100 for freelance work".
 *
 * @param text The conversational input text.
 * @param todayDate Today's date in 'YYYY-MM-DD' format, used to resolve relative dates like "today" or "yesterday".
 * @returns An array of extracted Transaction objects.
 */
export function extractConversationalTransactions(text: string, todayDate: string): Transaction[] {
	const transactions: Transaction[] = [];
	const lowerText = text.toLowerCase(); // Use lowercase for case-insensitive matching

	// Define patterns for common ways people describe transactions conversationally
	const patterns = [
		// Pattern 1: Expense descriptions (e.g., "I spent $X on Y [date]")
		{
			regex:
				/\b(?:I|we)\s+(?:spent|paid|bought)\s+\$?([\d,]+\.?\d*)\s+(?:on|for)\s+([^.,\n]+?)(?:\s+(?:on|last|this)?\s*(yesterday|today|\w+day|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?))?/gi,
			process: (match: RegExpExecArray) => {
				const amount = parseFloat(match[1].replace(/,/g, '')); // Extract and parse amount
				const description = match[2].trim(); // Extract description
				const dateContext = match[3] ? match[3].trim() : null; // Extract optional date string
				return { amount, description, dateContext, direction: 'out' as const }; // Return structured data, direction is 'out'
			}
		},
		// Pattern 2: Income descriptions (e.g., "I got $X from Y [date]")
		{
			regex:
				/\b(?:I|we)\s+(?:got|received|earned)\s+\$?([\d,]+\.?\d*)\s+(?:from|for)\s+([^.,\n]+?)(?:\s+(?:on|last|this)?\s*(yesterday|today|\w+day|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?))?/gi,
			process: (match: RegExpExecArray) => {
				const amount = parseFloat(match[1].replace(/,/g, ''));
				const description = match[2].trim();
				const dateContext = match[3] ? match[3].trim() : null;
				return { amount, description, dateContext, direction: 'in' as const }; // Direction is 'in'
			}
		},
		// Pattern 3: Implicit spending (e.g., "$X for Y [date]") - Assumes spending if no verb is present
		{
			regex:
				/\$?([\d,]+\.?\d*)\s+(?:for|on)\s+([^.,\n]+?)(?:\s+(?:on|last|this)?\s*(yesterday|today|\w+day|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?))?/gi,
			process: (match: RegExpExecArray) => {
				// Avoid double-counting if Pattern 1 already matched this (e.g., "I spent $20 for lunch")
				if (lowerText.includes(`spent ${match[0]}`) || lowerText.includes(`paid ${match[0]}`)) {
					return null; // Skip this match if it was part of a more explicit phrase
				}
				const amount = parseFloat(match[1].replace(/,/g, ''));
				const description = match[2].trim();
				const dateContext = match[3] ? match[3].trim() : null;
				return { amount, description, dateContext, direction: 'out' as const }; // Assume 'out' for implicit mentions
			}
		}
	];

	// --- Date Handling ---
	let generalDate = todayDate; // Default to today if no general date is found
	const generalDateMatch = text.match(
		/\b(?:on|last|this)?\s*(yesterday|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)\b/i
	);
	if (generalDateMatch) {
		const resolvedGeneral = resolveAndFormatDate(generalDateMatch[0]);
		if (resolvedGeneral !== 'unknown') {
			generalDate = resolvedGeneral;
		}
	}

	// --- Process Matches ---
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

				let type = 'unknown';
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

				transactions.push({
					// id: generateTransactionId(), // Using UUID
					id: uuidv4(),
					date: transactionDate,
					description: description,
					type: type,
					amount: amount, // Store as number
					category: finalCategory,
					notes: '',
					direction: direction
				});
			}
		}
	}

	return transactions;
}
