// src/lib/services/ai/prompts.ts
import type { Category, Transaction } from '$lib/stores/types';
import { formatCurrency } from '$lib/utils/currency';

/**
 * Get the system message for the conversation, including today's date.
 * @param todayDateString - Today's date in 'YYYY-MM-DD' format.
 */ // src/lib/services/ai/prompts.ts

// Keep existing getSystemPrompt, getExtractionPrompt, getOptimizedExtractionPrompt, getSummaryPrompt, getCategorySuggestionPrompt

/**
 * Creates a prompt to parse a user's correction message regarding a specific transaction.
 * Asks the LLM to identify the field to update and the new value.
 *
 * @param userCorrectionMessage - The user's message containing the correction.
 * @param targetTransaction - The specific transaction object the user is likely correcting.
 * @param availableCategories - List of valid category names.
 * @returns The prompt string for the LLM.
 */
export function getCorrectionParsingPrompt(
	userCorrectionMessage: string,
	targetTransaction: Transaction,
	availableCategories: readonly Category[] // Use readonly for safety
): string {
	// Format transaction details for the prompt context
	const transactionContext = `
Transaction Details to Correct:
- ID: ${targetTransaction.id}
- Date: ${targetTransaction.date}
- Description: ${targetTransaction.description}
- Amount: ${targetTransaction.amount.toFixed(2)}
- Category: ${targetTransaction.category}
- Type: ${targetTransaction.type}
- Direction: ${targetTransaction.direction}
- Notes: ${targetTransaction.notes || '(none)'}
    `.trim();

	// Define the valid fields the user can correct
	const validFields = "'amount', 'date', 'description', 'category'"; // Add 'type', 'notes' later if needed

	// Define the expected JSON output structure
	const jsonStructure = `
{
  "correction_possible": boolean, // true if the user message seems like a correction request, false otherwise
  "target_field": string, // ONE of ${validFields} or 'unknown' if the field isn't clear
  "new_value": string | number // The new value extracted from the user message. Use number for amount, string for others. Return null if value unclear.
}
    `.trim();

	return `
You are a precise assistant helping to correct transaction details.
The user is likely trying to correct the following transaction:

${transactionContext}

Analyze the user's latest message below and determine if they are requesting a correction to one of the transaction fields.

User Message: "${userCorrectionMessage}"

Your task is to parse the user's message and determine:
1.  If a correction is being requested ('correction_possible').
2.  Which specific field the user wants to change ('target_field'). It must be one of: ${validFields}. If unsure, use "unknown".
3.  What the new value for that field should be ('new_value'). Extract the value accurately.
    - For 'amount', provide a positive number (e.g., 25.50).
    - For 'date', provide the date as a 'YYYY-MM-DD' string. Resolve relative dates like 'today', 'yesterday' if possible (assume today is ${new Date().toISOString().split('T')[0]}).
    - For 'description', provide the new text.
    - For 'category', provide ONE category name exactly as it appears in this list: [${availableCategories.join(', ')}]. Match case-insensitively but return the correct casing. If the user mentions a category not in the list, set target_field to 'category' but new_value to null.
    - If the new value cannot be determined clearly for the identified field, set new_value to null.

Output ONLY the following JSON object, with no other text before or after it:
\`\`\`json
${jsonStructure}
\`\`\`

Example 1:
User Message: "no the amount was 15.75"
Transaction Description: "Coffee Shop"
Output JSON:
\`\`\`json
{
  "correction_possible": true,
  "target_field": "amount",
  "new_value": 15.75
}
\`\`\`

Example 2:
User Message: "change date to yesterday"
Transaction Description: "Lunch"
Output JSON (assuming today is 2025-04-17):
\`\`\`json
{
  "correction_possible": true,
  "target_field": "date",
  "new_value": "2025-04-16"
}
\`\`\`

Example 3:
User Message: "set category to Expenses"
Transaction Description: "Groceries"
Output JSON:
\`\`\`json
{
  "correction_possible": true,
  "target_field": "category",
  "new_value": "Expenses"
}
\`\`\`

Example 4:
User Message: "that description should be 'Dinner with friends'"
Transaction Description: "Restaurant"
Output JSON:
\`\`\`json
{
  "correction_possible": true,
  "target_field": "description",
  "new_value": "Dinner with friends"
}
\`\`\`

Example 5:
User Message: "that's correct"
Transaction Description: "Coffee Shop"
Output JSON:
\`\`\`json
{
  "correction_possible": false,
  "target_field": "unknown",
  "new_value": null
}
\`\`\`

Example 6:
User Message: "make it food"
Transaction Description: "Supermarket"
Available Categories: ["Groceries", "Restaurants", "Expenses"]
Output JSON:
\`\`\`json
{
  "correction_possible": true,
  "target_field": "category",
  "new_value": null // "food" is not in the available list
}
\`\`\`
    `.trim();
}

export function getSystemPrompt(todayDateString: string): string {
	// System prompt content remains the same...
	return `You are a friendly, attentive, and highly capable financial assistant. Your primary goal is to extract and organize transaction data (Date, Description, Amount, Type, Direction IN/OUT) from user input through natural conversation.
    (Today's date is ${todayDateString})

    **CORE RESPONSIBILITIES:**
    1. Extract ALL transactions mentioned in a message, not just the first one
    2. Handle multiple transactions in a single message
    3. Maintain a focused conversation about financial transactions
    4. Acknowledge and remember context from earlier in the conversation

    **CRITICAL BEHAVIORS:**
    1. **Extract ALL Transactions Mentioned:** When the user mentions multiple transactions in one message (e.g., "I spent $20 at Target yesterday and $50 at Amazon today"), extract and confirm ALL transactions, not just the first one.

    2. **Acknowledge All Provided Info:** When confirming transactions, include ALL details the user has provided for each transaction.

    3. **Ask Only for Missing Details:** For each transaction, if information is missing (e.g., no date, no description), ask a specific question targeting only the missing piece. Prioritize collecting this critical information:
       - Amount (how much was spent/received)
       - Date (when it happened)
       - Description (what it was for)
       - Direction (in/out - but infer this when possible)

    4. **Infer Direction Intelligently BUT CAUTIOUSLY:** Use keywords like "spent," "paid," "received," "earned," "credit," "debit" to determine if money was coming in (IN) or going out (OUT). Also consider transaction types (e.g., 'Card' is usually OUT, 'Deposit' is usually IN). **If the direction is ambiguous or cannot be reliably determined, set the 'direction' field to the literal string "unknown". Do NOT guess.**

    5. **Format Dates Consistently:** Use 'YYYY-MM-DD' format when storing dates internally. Display dates in a more human-readable format like "Monday, April 14, 2025" when confirming transactions.

    6. **Handle Non-Transaction Questions:** If the user asks non-transaction questions about yourself (like "what model are you?"), politely answer them before returning to transaction processing. Maintain your identity as an AI Transaction Assistant.

    7. **Error Recovery:** If you encounter an error processing a transaction, specify exactly which transaction caused the problem and ask the user to rephrase just that part.

    8. **Clear Confirmations:** After successfully processing transactions, provide a clear summary of what you've recorded.

    **CONVERSATION FLOW:**
    - When the user mentions multiple transactions, process ALL of them, not just the first one
    - If the user asks about you or the system, answer appropriately before continuing with transaction processing
    - If you encounter an error or ambiguity, be specific about what's causing the problem
    - Always maintain a helpful, patient tone

    Your goal is to help users organize their financial data efficiently while providing a natural, conversational experience.`;
}

/**
 * General prompt for extracting transactions from text, including today's date context.
 * Enhanced to better handle multiple transactions and relative dates.
 */ export function getExtractionPrompt(text: string, todayDateString: string): string {
	return `
  Extract transactions from the user’s input.  
  **Convert any spelled‑out amounts (e.g. “twenty bucks”) into numeric dollars (e.g. 20.00).**  
  **When you fill in the “description” field, please capitalize it in Title Case (e.g. “Whole Foods”, “Online Gig Payment”). You can let articles or simple word like "a", "the", "and", "for", etc. be uncapitalized, whatever seems to make the most aesthetic sense for you.**  
  Preserve dates as YYYY‑MM‑DD or sensible relative terms.  
  Just output valid JSON: an array of objects with keys { date, description, amount, direction, type, details }.
  
  Text to Analyze:
  "${text}"
  
  Create a separate transaction object for EACH distinct transaction mentioned. Be thorough and don't miss any transactions, even if they're mentioned briefly. Resolve relative dates like "today," "yesterday," "last monday," "last week," "last month," etc. to 'YYYY-MM-DD' format based on today being ${todayDateString}.
  
  Required JSON fields for each transaction:
  1. date: (String) Specific date "YYYY-MM-DD" or "unknown" if unresolvable.
  2. description: (String) What the transaction was for (merchant, person, service, item purchased) or "unknown". Be specific (e.g., "Target" not "groceries").
  3. details: (String) Any additional context provided (e.g., "for birthday", "invoice #123") - empty string "" if none.
  4. type: (String) Best guess of transaction type ("Card", "Cash", "Check", "Transfer", "PayPal", "Zelle", "ACH", "Deposit", "Withdrawal", etc.) or "unknown".
  5. amount: (Number) The numeric dollar amount without currency symbol (e.g., 20.00 not $20.00). Must be greater than 0. Use 0 only if amount is truly unknown.
  6. direction: (String) "in" for received money (income, deposit, credit), "out" for spent/paid money (expense, debit, withdrawal). **If the direction cannot be reliably determined from keywords or context, set this field to the literal string "unknown". Do NOT guess.**
  
  CRITICAL INSTRUCTION: Your response MUST BEGIN IMMEDIATELY with the opening bracket '[' of the JSON array. DO NOT include ANY explanatory text, thinking, preamble, or markdown code blocks. Just the raw JSON. If you add ANY text before the JSON array, it will cause parsing errors.
  `.trim();
}

/**
 * Optimized prompt specifically for extracting transactions from bank statement text
 * that follows a known format (Date, Description lines, Type, Amount).
 * @param text The bank statement text (limit length if necessary).
 * @param todayDateString Today's date in 'YYYY-MM-DD' format.
 */
export function getOptimizedExtractionPrompt(text: string, todayDateString: string): string {
	// Optimized extraction prompt content remains the same...
	const maxChars = 100000; // Adjust as needed
	const truncatedText =
		text.length > maxChars ? text.substring(0, maxChars) + '\n... (truncated)' : text;

	return `Extract ALL financial transactions from the following bank statement text.
    Today's date is ${todayDateString}.

    The bank statement text generally follows this structure for each transaction:
    - Line 1: Date (e.g., "Apr 12, 2025" or "04/12/2025")
    - Line(s) 2+: Description (Merchant name, transfer details, PPD ID, etc.)
    - Penultimate Line (often): Transaction Type (e.g., "ACH credit", "Card", "Zelle credit", "Withdrawal")
    - Last Line: Amount (e.g., "$599.52")

    Text to Analyze:
    \`\`\`
    ${truncatedText}
    \`\`\`

    Create a JSON object containing a "transactions" array. For EACH transaction identified in the text, add an object to the array with these fields:
    - date: (String) The transaction date in "YYYY-MM-DD" format. Resolve relative dates if any appear.
    - description: (String) The primary description line(s). Combine multiple description lines if appropriate.
    - details: (String) Any secondary details like PPD IDs, reference numbers if clearly separable, otherwise "".
    - type: (String) The transaction type identified (e.g., "ACH", "Zelle", "Card", "Deposit"). Infer if not explicit.
    - amount: (Number) The numeric amount WITHOUT the '$' sign (e.g., 599.52). Must be greater than 0.
    - direction: (String) "in" for credits/deposits, "out" for debits/withdrawals/card purchases. Infer from type line (credit/debit) or keywords. **If the direction cannot be reliably determined, set this field to the literal string "unknown". Do NOT guess.**

    EXAMPLE:
    Input Snippet:
    Apr 12, 2025
    PAYPAL TRANSFER PPD ID: PAYPALSD11
    ACH credit
    $599.52
    Apr 11, 2025
    TRADER JOES #123 OAK PARK IL
    Check Card 1234
    $45.67
     Apr 10, 2025
     MISC TRANSACTION XYZ
     $25.00

    Output JSON:
    {
      "transactions":
    }

    IMPORTANT: Provide ONLY the raw JSON object response. No introductory text, explanations, or summaries. Ensure the JSON is valid. If no transactions are found, return { "transactions": }.`;
}

/**
 * Prompt for summarizing extracted transactions.
 */
export function getSummaryPrompt(transactions: Transaction[]): string {
	// Correctly handle amount as number
	const incomeTotal = transactions
		.filter((t) => t.direction === 'in')
		.reduce((sum, t) => sum + Number(t.amount || 0), 0); // Use Number()
	const expenseTotal = transactions
		.filter((t) => t.direction === 'out')
		.reduce((sum, t) => sum + Number(t.amount || 0), 0); // Use Number()
	const netTotal = incomeTotal - expenseTotal;
	let dateRange = 'unknown';
	const validDates = transactions
		.map((t) => t.date)
		.filter((d) => d && d !== 'unknown' && !isNaN(new Date(d).getTime()))
		.sort();
	if (validDates.length > 0) {
		dateRange = `${validDates[0]} to ${validDates[validDates.length - 1]}`;
		if (validDates.length === 1) dateRange = validDates[0];
	}

	return `Let me summarize the ${transactions.length} transaction(s) we've recorded:

    Summary:
    - Total Income (IN): ${formatCurrency(incomeTotal)}
    - Total Expenses (OUT): ${formatCurrency(expenseTotal)}
    - Net Result: ${formatCurrency(netTotal)}
    - Date Range: ${dateRange}

    Transaction Breakdown:
    ${transactions
			.map((t, i) => {
				// Amount is already a number, no need for parseFloat/replace
				const amtNum = Number(t.amount || 0); // Ensure it's treated as number
				const directionDisplay =
					t.direction === 'in' ? 'received' : t.direction === 'out' ? 'spent' : '(direction?)';
				return `${i + 1}. ${t.date !== 'unknown' ? t.date : 'Date unknown'}: ${formatCurrency(amtNum)} ${directionDisplay} ${t.description !== 'unknown' ? 'for ' + t.description : ''} (${t.category})`;
			})
			.join('\n    ')}

    Would you like to:
    1. Add these transactions to your main list?
    2. Make changes to any of these transactions?
    3. Add more transactions?
    4. Discard these transactions?`;
}

/**
 * Get prompt for suggesting a category for a transaction
 */
export function getCategorySuggestionPrompt(
	transaction: Transaction,
	categories: string[]
): string {
	// Category suggestion prompt content remains the same...
	return `
    You are a financial transaction categorizer. Based on the transaction details below, suggest the most appropriate category from this list: ${categories.join(', ')}.

    Transaction:
    Date: ${transaction.date}
    Description: ${transaction.description}
    Type: ${transaction.type}
    Amount: $${transaction.amount}
    Direction: ${transaction.direction}

    Consider common patterns:
    - PayPal transfers often involve "PAYPAL" in the description
    - Business income for Austen Cloud Performance may include client names like "KAREN M BURRIS", "FULL MOON JAM FOUNDATION", "PYROTECHNIQ", "ROBERT G BERSHADSKY"
    - Crypto sales usually mention "Coinbase" or "COINBASE"
    - Non-taxable research may mention "Open Research" or "YC RESEARCH"
    - Insect Asylum work will include "THE INSECT ASYLUM INC."
    - Card transactions are typically expenses unless description indicates otherwise (e.g., refund)
    - Zelle/ACH credits are often income or transfers
    - Zelle/ACH debits are often expenses or transfers

    Respond with just the category name from the provided list, nothing else. If no category fits well, respond with "Other / Uncategorized".
  `;
}
