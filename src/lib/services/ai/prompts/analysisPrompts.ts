// src/lib/services/ai/analysisPrompts.ts
import type { Transaction } from '$lib/types/types'; // Assuming types are here
import { formatCurrency } from '$lib/utils/helpers'; // Assuming helper is here

/**
 * Prompt for summarizing extracted transactions.
 */
export function getSummaryPrompt(transactions: Transaction[]): string {
	// Calculate totals, ensuring amounts are numbers
	const incomeTotal = transactions
		.filter((t) => t.direction === 'in')
		.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
	const expenseTotal = transactions
		.filter((t) => t.direction === 'out')
		.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
	const netTotal = incomeTotal - expenseTotal;

	// Determine date range from valid dates
	let dateRange = 'unknown';
	const validDates = transactions
		.map((t) => t.date)
		.filter(
			(d): d is string =>
				d !== undefined && d !== null && d !== 'unknown' && !isNaN(new Date(d).getTime())
		)
		.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

	if (validDates.length > 0) {
		const formatDate = (dateStr: string) => {
			try {
				// Format date nicely, e.g., "Apr 17, 2025"
				return new Date(dateStr).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
			} catch (e) {
				return dateStr; // Fallback to original string if formatting fails
			}
		};
		const startDate = formatDate(validDates[0]);
		const endDate = formatDate(validDates[validDates.length - 1]);
		dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
	}

	// Create transaction breakdown string
	const breakdown = transactions
		.map((t, i) => {
			const amtNum = Number(t.amount) || 0;
			const directionDisplay =
				t.direction === 'in' ? 'received' : t.direction === 'out' ? 'spent' : '(direction?)';
			const dateDisplay = t.date && t.date !== 'unknown' ? t.date : 'Date unknown';
			// Use description only if it's meaningful
			const descriptionDisplay =
				t.description && t.description.toLowerCase() !== 'unknown' && t.description.trim() !== ''
					? `for ${t.description}`
					: '';
			const categoryDisplay = t.category ? `(${t.category})` : '(No Category)';

			return `${i + 1}. ${dateDisplay}: ${formatCurrency(amtNum)} ${directionDisplay} ${descriptionDisplay} ${categoryDisplay}`;
		})
		.join('\n    '); // Indent each line

	return `
Okay, I have ${transactions.length} transaction(s) ready based on our conversation:

Summary:
- Total Income (IN): ${formatCurrency(incomeTotal)}
- Total Expenses (OUT): ${formatCurrency(expenseTotal)}
- Net Result: ${formatCurrency(netTotal)}
- Date Range: ${dateRange}

Transaction Breakdown:
    ${breakdown}

What would you like to do next? You can:
1. Confirm & add these to your list.
2. Make corrections to any of them.
3. Add more transactions.
4. Discard these transactions.
`.trim(); // Use trim() for clean output
}

/**
 * Get prompt for suggesting a category for a transaction
 */
export function getCategorySuggestionPrompt(
	transaction: Transaction,
	categories: string[]
): string {
	// Ensure amount is treated as a number
	const amountValue = Number(transaction.amount) || 0;
	return `
You are a financial transaction categorizer. Based on the transaction details below, suggest the most appropriate category from this list:

Available Categories: ${categories.join(', ')}

Transaction Details:
- Date: ${transaction.date}
- Description: ${transaction.description}
- Type: ${transaction.type}
- Amount: ${formatCurrency(amountValue)}
- Direction: ${transaction.direction}

Consider common patterns:
- PayPal transfers often involve "PAYPAL" in the description
- Business income for performance artists might include client names like "KAREN M BURRIS", "FULL MOON JAM FOUNDATION", "PYROTECHNIQ", "ROBERT G BERSHADSKY", "STAGE FACTOR", "FAIRY CASTLE ENTERTAINMENT"
- Crypto sales usually mention "Coinbase" or "COINBASE INC."
- Non-taxable research may mention "Open Research EDC survey" or "YC RESEARCH"
- Work for specific clients might mention "THE INSECT ASYLUM INC."
- Card transactions are typically expenses unless description indicates otherwise (e.g., refund)
- Zelle/ACH credits are often income or transfers
- Zelle/ACH debits are often expenses or transfers
- Payroll usually contains "Payroll" or specific employer names like "SPARKLES ENTERTA"
- Check Deposits often contain "REMOTE ONLINE DEPOSIT"
- Venmo cashouts contain "VENMO CASHOUT"

Respond with ONLY the single most likely category name exactly as it appears in the provided list. Do not include any other text, explanation, or punctuation. If no category fits well based on the details and patterns, respond with the exact phrase "Other / Uncategorized".
`.trim();
}

/**
 * Creates a prompt to get a short description for a split item based on user message.
 * @param originalMessage - The user's message mentioning the split.
 */
export function getSplitItemDescriptionPrompt(originalMessage: string): string {
	// Use template literals for easier multi-line string formatting
	return `
Analyze the following user message which mentions splitting a bill or cost:
---
"${originalMessage}"
---

Based ONLY on the message above, what specific item, service, or event was being split?

Respond with ONLY a short, descriptive noun phrase (2-4 words maximum, using Title Case).

Good Examples: "Dinner Bill", "Groceries", "Cab Fare", "Hotel Room", "Concert Tickets", "Lunch", "Coffee Run"
Bad Examples: "Split Bill", "Item", "The cost mentioned", "¥25k", "$120 bill"

If the specific item isn't clear from the text, respond with the exact phrase "Shared Item".
Do not include amounts, currencies, dates, or how many people were involved. Just the item/service.
`.trim(); // trim() removes leading/trailing whitespace including the initial newline
}
