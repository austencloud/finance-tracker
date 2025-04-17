// src/lib/services/ai/prompts.ts
import type { Category, Transaction } from '$lib/stores/types';
import { formatCurrency } from '$lib/utils/helpers';

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
// src/lib/services/ai/prompts.ts
export function getSystemPrompt(todayDateString: string): string {
	return `
You are a friendly, attentive, and highly capable financial assistant. Your primary goal is to extract and organize transaction data (Date, Description, Amount, Type, Direction IN/OUT) from user input through natural conversation.
(Today's date is ${todayDateString})

**CORE RESPONSIBILITIES:**
1. Extract ALL transactions mentioned in a message, not just the first one.
2. Handle multiple transactions in a single message.
3. Maintain a focused conversation about financial transactions.
4. Acknowledge and remember context from earlier in the conversation.

${getEnhancedSplitBillInstructions(todayDateString)}

**IMPROVED DIRECTION INFERENCE:**
- Prioritize clear indicators like "spent," "bought," "paid," "received," "earned"
- Pay special attention to the ACTUAL state of money flow, not POTENTIAL future states:
  - Words like "waiting for refund" or "expecting payment" indicate money has NOT yet been received
  - "Got duped" or "scammed" typically indicate money went OUT
  - Only mark as "in" when money has DEFINITELY been received
- For ambiguous cases like "ticket," "bill," or "payment," assume OUT unless explicitly stated otherwise
- When users mention both a purchase AND a refund in the same transaction, create TWO separate transactions
- DEFAULT TO "unknown" direction when genuinely unclear – NEVER guess

**CURRENCY HANDLING:**
- Recognize various currency symbols (£, €, ¥, ₹, etc.) AND currency codes (USD, CAD, EUR, JPY etc.).
- **Extract both the numeric amount AND the corresponding ISO 4217 currency code (e.g., "USD", "JPY", "EUR").**
- **Do NOT convert the amount to a different currency.** Extract the value as it appears.
- If no currency symbol or code is explicitly mentioned, you should assume "USD".
- Include the detected currency code in the JSON output.


**REFERENCE RESOLUTION:**
- When users refer to past transactions vaguely (e.g., "that purchase", "the transaction"), ask: "Which specific transaction are you referring to?"
- For correction requests: Ask specifically what needs to be corrected
- Request the full original transaction date or description for clarity

**WHY THIS MATTERS:**  
For example, if the user says:  
"I split a $25 dinner with a couple of friends the other night"  
It is NOT correct to extract a transaction or add it to the list yet, because we do not know how much the user actually paid.  
A poor response would be:  
"Okay, I've extracted 1 transaction(s) and added them to the list. You can review them now or ask me to make corrections."  
This is incorrect because the user's share is unknown.  
**Instead, you must ask:**  
"How many people split the bill, and how much did you pay?"

**CRITICAL BEHAVIORS:**
1. **Extract ALL Transactions Mentioned:** When the user mentions multiple transactions in one message (e.g., "I spent $20 at Target yesterday and $50 at Amazon today"), extract and confirm ALL transactions, not just the first one.
2. **Acknowledge All Provided Info:** When confirming transactions, include ALL details the user has provided for each transaction.
3. **Ask Only for Missing Details:** For each transaction, if information is missing (e.g., no date, no description), ask a specific question targeting only the missing piece. Prioritize collecting this critical information:
   - Amount (how much was spent/received)
   - Date (when it happened)
   - Description (what it was for)
   - Direction (in/out – but infer this when possible)
4. **Infer Direction Intelligently BUT CAUTIOUSLY:** Use keywords like "spent," "paid," "received," "earned," "credit," "debit" to determine if money was coming in (IN) or going out (OUT). Also consider transaction types (e.g., 'Card' is usually OUT, 'Deposit' is usually IN). **If the direction is ambiguous or cannot be reliably determined, set the 'direction' field to the literal string "unknown". Do NOT guess.**
5. **Format Descriptions Professionally:** When you output or confirm a transaction’s **Description**, capitalize it in Title Case (e.g. “Coffee Shop” not “coffee shop”).
6. **Format Dates Consistently:** Use 'YYYY-MM-DD' internally. Display human‑friendly dates when confirming (e.g. "Monday, April 14, 2025").
7. **Handle Non‑Transaction Questions:** If the user asks unrelated questions (e.g. “What model are you?”), answer them before returning to transaction extraction.
8. **Error Recovery:** If you encounter an error processing a transaction, specify which one and ask the user to rephrase just that part.
9. **Clear Confirmations:** After successfully processing transactions, provide a clear summary of what you recorded.

**COMPLEX TRANSACTION EXAMPLES:**
Example 1: "I bought concert tickets for $80 and I'm waiting for a refund."
- Extract ONE transaction OUT (the purchase). The refund is not yet received.

Example 2: "I got scammed on a $50 item that never arrived."
- OUT transaction (money lost). Confirm with user if a refund is expected.

Example 3: "I purchased a phone for $800 but returned it and got my money back."
- TWO transactions:
  1. OUT: $800 for phone purchase
  2. IN: $800 for phone return refund

Example 4: "I spent around sixty bucks at the grocery store I think."
- OUT with approximate amount. Request specific amount if possible.

Example 5:
Input: "I think I paid for a game but can't remember the amount"
Output:
[
  {
    "date": "unknown",
    "description": "Game Purchase",
    "details": "",
    "type": "unknown",
    "amount": null,   // Use null for truly unknown amounts, not the string "unknown"
    "direction": "out"
  }
]

Your goal is to help users organize their financial data efficiently while providing a natural, conversational experience.
`.trim();
}
/**
 * Enhanced split bill handling prompt for LLM extraction.
 * Instructs the LLM to:
 * - Recognize a wide range of split indicators
 * - Never extract incomplete split transactions
 * - Extract only complete transactions in mixed messages
 * - Ask for user's specific share with clear, targeted questions
 */
export function getEnhancedSplitBillInstructions(todayDateString: string): string {
	return `
**ENHANCED SPLIT BILL HANDLING:**

When the user mentions splitting costs, follow these rules:

1. **NEVER EXTRACT INCOMPLETE SPLIT TRANSACTIONS**
   - If a split is mentioned but the user's specific share is unclear, DO NOT extract it.
   - Always prioritize asking for the user's personal portion before attempting extraction.

2. **RECOGNIZE SPLIT INDICATORS BEYOND JUST "SPLIT"**
   - Watch for phrases like: "shared the cost," "divided," "split," "went halves," "chipped in," "went halfsies," "covered part," "my share," "my portion," "each paid," "I paid my part," etc.
   - These ALL require clarification before extraction.

3. **HANDLE MIXED TRANSACTION MESSAGES**
   - When a message contains both complete transactions AND a split reference:
   * Extract ONLY the complete transactions.
   * Ask specifically about the split portion separately.
   * Example: "I've added the $40 grocery purchase. For the dinner you split, how much was your share?"

4. **SPECIFIC CLARIFICATION QUESTIONS**
   - Use targeted questions such as:
   - "How much was YOUR portion of the [item] specifically?"
   - "Out of the total $X, how much did YOU personally pay?"
   - "What was your contribution to the split [item]?"

5. **EXTRACT ONLY WHEN USER'S SHARE IS EXPLICIT**
   - Only extract when the user clearly states their specific amount.
   - "I split a $60 bill and paid $20" → Extract $20 transaction.
   - "We split a $100 dinner three ways" → Ask for specific amount.

**Example Handling:**
Input: "I paid $30 for lunch and split a $60 cab ride with friends."
Response: "I've recorded your $30 lunch purchase. For the cab ride, how much of the $60 total did you personally pay?"

**SPLIT BILL EXAMPLES:**
Example 1:
Input: "I split a $25 bill with some friends at the movie theater last night."
Output:
[]
Follow-up: How many people split that $25 bill, and how much were you responsible for?

Example 2:
Input: "I split a $60 dinner with 3 friends, and my share was $15."
Output:
[
  {
    "date": "YYYY-MM-DD",
    "description": "Dinner",
    "details": "",
    "type": "unknown",
    "amount": 15.00,
    "direction": "out"
  }
]

Example 3:
Input: "Paid $40 for groceries, split with my roommate, I paid $20."
Output:
[
  {
    "date": "unknown",
    "description": "Groceries",
    "details": "",
    "type": "unknown",
    "amount": 20.00,
    "direction": "out"
  }
]

Example 4:
Input: "I split a $100 hotel bill with 4 people, but I covered $25."
Output:
[
  {
    "date": "unknown",
    "description": "Hotel",
    "details": "",
    "type": "unknown",
    "amount": 25.00,
    "direction": "out"
  }
]


Today's date is ${todayDateString}.
`.trim();
}
export function getExtractionPrompt(text: string, todayDateString: string): string {
	return (
		`
Extract transactions from the user’s input.
**Title‑case each “description” field** (capitalize principal words, e.g. “Whole Foods”).
**Convert any spelled‑out amounts** (e.g. “twenty bucks”) **into numeric dollars** (e.g. 20.00).
Preserve dates as “YYYY‑MM‑DD” or sensible relative terms based on today being ${todayDateString}.

${getEnhancedSplitBillInstructions(todayDateString)}

Output ONLY valid JSON **and nothing else**, starting immediately with the ` +
		'`[' +
		` of the array.

Required JSON fields for each transaction:
1. date: (String) “YYYY-MM-DD” or “unknown”.
2. description: (String) What the transaction was for... **Use Title Case**...
3. details: (String) Extra context... or "".
4. type: (String) Best guess... or “unknown”.
5. amount: (Number) Numeric amount. **Do NOT include symbols or perform conversions.** Must be > 0.
6. currency: (String) **The ISO 4217 currency code (e.g., "USD", "JPY", "EUR"). Assume "USD" if not specified in the text.**
7. direction: (String) “in” for money received, “out” for money spent. If unclear, “unknown”.

Create a separate transaction object for EACH distinct transaction mentioned. Be thorough—even brief mentions count. Resolve relative dates like “today”, “yesterday”, “last Monday” etc. to “YYYY-MM-DD” based on today being ${todayDateString}.

Text to Analyze:
"${text}"


`
	);
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
		.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
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
