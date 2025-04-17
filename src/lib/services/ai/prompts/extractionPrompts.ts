// src/lib/services/ai/extractionPrompts.ts
import { getEnhancedSplitBillInstructions } from './systemPrompts'; // Import from systemPrompts

/**
 * Get the prompt for extracting transactions from natural language user input.
 * @param text - The user's input text.
 * @param todayDateString - Today's date in 'YYYY-MM-DD' format.
 */
export function getExtractionPrompt(text: string, todayDateString: string): string {
	return `
Extract transactions from the user’s input.
**Title-case each "description" field** (capitalize principal words, e.g. “Whole Foods”).
**Convert any spelled-out amounts** (e.g. “twenty bucks”) **into numeric dollars** (e.g. 20.00).
Preserve dates as “YYYY-MM-DD” or sensible relative terms based on today being ${todayDateString}.

${getEnhancedSplitBillInstructions(todayDateString)}

Output ONLY valid JSON **and nothing else**, starting immediately with the \`[\` of the array.

Required JSON fields for each transaction:
1. date: (String) You **MUST** resolve relative dates (like 'today', 'yesterday', 'last Friday') to a specific **'YYYY-MM-DD'** format based on today being ${todayDateString}. If no date information is present or it cannot be determined, output the literal string **"unknown"**. Do NOT output the placeholder string 'YYYY-MM-DD'.
2. description: (String) What the transaction was for... **Use Title Case**. If not provided, use "unknown".
3. details: (String) Extra context provided by the user, or "".
4. type: (String) Best guess based on context (e.g., "Card", "Zelle", "Cash", "Transfer"), or "unknown".
5. amount: (Number) Numeric amount. **Do NOT include symbols or perform currency conversions.** Must be > 0. If amount is truly unknown, use null.
6. currency: (String) **The ISO 4217 currency code (e.g., "USD", "JPY", "EUR"). Assume "USD" if not specified in the text.**
7. direction: (String) “in” for money received, “out” for money spent. **Infer cautiously.** If unclear, use the literal string "unknown".

Create a separate transaction object for EACH distinct transaction mentioned. Be thorough—even brief mentions count.

Text to Analyze:
"${text}"

Your response MUST start with \`[\` and end with \`]\`. Do not include any text before or after the JSON array.
`.trim(); // trim() is important here
}

/**
 * Optimized prompt specifically for extracting transactions from bank statement text
 * that follows a known format (Date, Description lines, Type, Amount).
 * @param text The bank statement text (limit length if necessary).
 * @param todayDateString Today's date in 'YYYY-MM-DD' format.
 */
export function getOptimizedExtractionPrompt(text: string, todayDateString: string): string {
	// NOTE: This prompt assumes the input text *is* bank statement data.
	// Consider adding a check or different handling if the text format is uncertain.
	const maxChars = 100000; // Adjust as needed for LLM context limits
	const truncatedText =
		text.length > maxChars ? text.substring(0, maxChars) + '\n... (truncated)' : text;

	return `
Extract ALL financial transactions from the following bank statement text.
Today's date is ${todayDateString}.

The bank statement text generally follows this structure for each transaction:
- Line 1: Date (e.g., "Apr 17, 2025" or "04/17/2025")
- Line(s) 2+: Description (Merchant name, transfer details, PPD ID, etc.)
- Penultimate Line (often): Transaction Type (e.g., "ACH credit", "Card", "Zelle credit", "Deposit")
- Last Line: Amount (e.g., "$599.52")

Text to Analyze:
\`\`\`
${truncatedText}
\`\`\`

Create a JSON object containing a single key "transactions" whose value is an array. For EACH transaction identified in the text, add an object to the array with these fields:
- date: (String) The transaction date in "YYYY-MM-DD" format. Convert any found date formats (e.g., "Apr 17, 2025") to this format.
- description: (String) The primary description line(s). Combine multiple description lines if appropriate. Use Title Case.
- details: (String) Any secondary details like PPD IDs, reference numbers if clearly separable, otherwise "".
- type: (String) The transaction type identified (e.g., "ACH", "Zelle", "Card", "Deposit", "Other"). Infer if not explicit.
- amount: (Number) The numeric amount WITHOUT the '$' or other currency symbols (e.g., 599.52). Must be greater than 0.
- currency: (String) The ISO 4217 currency code (e.g., "USD", "JPY", "EUR"). Assume "USD" if not specified or only '$' is present.
- direction: (String) "in" for credits/deposits, "out" for debits/withdrawals/card purchases. Infer from type line (credit/debit) or keywords. **If the direction cannot be reliably determined, set this field to the literal string "unknown". Do NOT guess.**

EXAMPLE:
Input Snippet:
Apr 17, 2025
PAYPAL TRANSFER PPD ID: PAYPALSD11
ACH credit
$599.52
Apr 16, 2025
TRADER JOES #123 CHICAGO IL
Card
$45.67
Apr 15, 2025
UNKNOWN DEBIT
$25.00

Output JSON:
{
  "transactions": [
    {
      "date": "2025-04-17",
      "description": "Paypal Transfer Ppd Id: Paypalsd11",
      "details": "PPD ID: PAYPALSD11",
      "type": "ACH",
      "amount": 599.52,
      "currency": "USD",
      "direction": "in"
    },
    {
      "date": "2025-04-16",
      "description": "Trader Joes #123 Chicago Il",
      "details": "",
      "type": "Card",
      "amount": 45.67,
      "currency": "USD",
      "direction": "out"
    },
     {
      "date": "2025-04-15",
      "description": "Unknown Debit",
      "details": "",
      "type": "Other",
      "amount": 25.00,
      "currency": "USD",
      "direction": "out" // Assuming "Debit" means out
    }
  ]
}

IMPORTANT: Provide ONLY the raw JSON object response { "transactions": [...] }. No introductory text, explanations, backticks around the JSON, or summaries. Ensure the JSON is valid. If no transactions are found, return { "transactions": [] }.
`.trim();
}

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
