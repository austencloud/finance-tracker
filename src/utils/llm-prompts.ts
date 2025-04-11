// src/utils/llm-prompts.ts
/**
 * This file contains the standardized prompts for the LLM conversation system
 * Separating these allows for easier testing and refinement of prompts
 */

/**
 * Get the system message for the conversation
 */ // src/utils/llm-prompts.ts

export function getSystemPrompt(): string {
	// const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); // Consider adding for relative dates

	return `You are a friendly, helpful financial assistant designed to extract structured transaction data (Date, Description, Amount, Type, Direction IN/OUT) from user input.

    **Core Task:** Extract transaction details accurately.

    **CRITICAL BEHAVIOR: Handling Incomplete Information**
    - If a user provides partial transaction info (e.g., amount and date but no description like "I spent $120 on April 3 2024"), **DO NOT** state that you cannot recognize the transaction or ask them to paste data again.
    - Instead, **ACKNOWLEDGE** the information provided and **ASK a specific, friendly question** to get the missing detail(s).
    - Example 1 (Missing Description):
        User: I spent $120 on April 3 2024.
        Assistant: Okay, $120 spent on April 3, 2024. What was that purchase for?
    - Example 2 (Missing Amount):
        User: Paid my rent last Tuesday.
        Assistant: Got it, rent paid last Tuesday. How much was the payment?
    - Example 3 (Ambiguous Direction):
        User: $500 from John Doe on May 1st.
        Assistant: Okay, $500 involving John Doe on May 1st. Was that money you received, or money you paid out?

    **Other Important Guidelines:**
    1.  **Be Conversational:** Act like a finance friend – warm, clear, and helpful.
    2.  **Extract Diligently:** Handle both formal data pastes and informal descriptions ("spent $20 at Target").
    3.  **Clarify IN vs. OUT:** Use terms like "spent", "paid", "bought" (OUT) and "received", "deposit", "income" (IN). Assume "spent" means OUT unless otherwise specified. Ask if ambiguous.
    4.  **Accuracy:** Capture amounts and dates precisely. Format amounts like $120.00.
    5.  **Summarize Clearly:** When asked, summarize extracted transactions logically (e.g., by date or category).

    **Extraction Fields:**
    - Date: Specific (MM/DD/YYYY, etc.) or relative ("yesterday"). Default: "unknown", then ask.
    - Description: Merchant, person, service. Default: "unknown", then ask.
    - Amount: Numeric dollar amount. Default: 0, then ask.
    - Type: Infer ("Card", "Cash", "Income", etc.). Default: "Other", then ask.
    - Direction: "IN" or "OUT". Default: "unknown", then ask.

    Your goal is to guide the user to provide complete information through natural conversation when extraction results are incomplete. Avoid generic failure messages when partial data exists.`;
}
/**
 * Prompt for extracting transactions from text
 */ // src/utils/llm-prompts.ts

export function getExtractionPrompt(text: string): string {
	return `Carefully analyze the following text and extract all possible financial transactions, even if the information is incomplete or informal. Focus on extracting the core details available.

    Text to Analyze:
    "${text}"

    For each potential transaction found, provide the following details in JSON format within a 'transactions' array. **If a detail is not explicitly mentioned or clearly inferable, use the string "unknown".** Do not make up information.

    Required JSON fields for each transaction object:
    1.  date: (String) Specific date "MM/DD/YYYY", relative time "yesterday", or "unknown".
    2.  description: (String) Merchant, person, service, or "unknown".
    3.  details: (String) Any extra context provided. Empty string "" if none.
    4.  type: (String) Best guess ("Card", "Cash", "Income", etc.) or "unknown".
    5.  amount: (Number) The numeric dollar amount (e.g., 120.00). Use 0 if not found.
    6.  direction: (String) "IN" for received, "OUT" for spent/paid. Infer based on keywords like "spent", "paid", "received". Default to "unknown" if truly ambiguous or keywords are missing.

    **Example 1:**
    Input: "I spent $120 on April 3 2024."
    Output JSON:
    {
      "transactions": [
        {
          "date": "04/03/2024",
          "description": "unknown",
          "details": "",
          "type": "unknown",
          "amount": 120.00,
          "direction": "OUT"
        }
      ]
    }

    **Example 2:**
    Input: "$500 received last week"
    Output JSON:
    {
      "transactions": [
        {
          "date": "last week",
          "description": "unknown",
          "details": "",
          "type": "unknown",
          "amount": 500.00,
          "direction": "IN"
        }
      ]
    }

    **Example 3:**
    Input: "Target purchase"
    Output JSON:
    { "transactions": [] } // Not enough info (needs amount/date)

    Output **only** the raw JSON object containing the 'transactions' array. No explanations. If no plausible transaction is found (missing amount/date/action), return: { "transactions": [] }`;
}
/**
 * Prompt for summarizing extracted transactions
 */
export function getSummaryPrompt(transactions: any[]): string {
	// Calculate some basic statistics
	const incomeTotal = transactions
		.filter((t) => t.direction === 'IN')
		.reduce((sum, t) => sum + (parseFloat(t.amount.toString()) || 0), 0);

	const expenseTotal = transactions
		.filter((t) => t.direction === 'OUT')
		.reduce((sum, t) => sum + (parseFloat(t.amount.toString()) || 0), 0);

	const netTotal = incomeTotal - expenseTotal;

	// Get date range
	let dateRange = 'unknown';
	const datedTransactions = transactions.filter((t) => t.date && t.date !== 'unknown');
	if (datedTransactions.length > 0) {
		// This is a simplified approach - may need more sophisticated date parsing
		dateRange = `${datedTransactions[0].date} to ${datedTransactions[datedTransactions.length - 1].date}`;
	}

	return `I need to summarize the transactions I've extracted.
    
    Here are the statistics:
    - Total transactions: ${transactions.length}
    - Money IN (income/refunds): $${incomeTotal.toFixed(2)}
    - Money OUT (expenses): $${expenseTotal.toFixed(2)}
    - Net total: $${netTotal.toFixed(2)}
    - Date range: ${dateRange}
    
    Please provide a clear, friendly summary of these transactions, organizing them by category (income vs. expenses).
    Mention the total amounts and ask if the user wants to add these transactions to their list or make adjustments.
    
    Make sure all calculations are double-checked and accurate.`;
}

/**
 * Prompt for improving the quality of extraction when a user adds new transactions
 */
export function getTransactionUpdatePrompt(newText: string, existingTransactions: any[]): string {
	return `The user has provided additional transaction information. Please extract any new transactions and integrate them with the existing ones.
    
    New information: "${newText}"
    
    Existing transactions:
    ${JSON.stringify(existingTransactions, null, 2)}
    
    Extract all transactions from the new information and provide them in the same format.
    For any transactions that seem to clarify or update existing ones, please note this.
    
    Format as JSON like this:
    {
      "newTransactions": [
        {
          "date": "MM/DD/YYYY or description",
          "description": "Merchant or transaction description",
          "details": "Additional details about the transaction",
          "type": "Transaction type",
          "amount": 123.45,
          "direction": "IN or OUT"
        }
      ],
      "updatedTransactions": [
        {
          "index": 0, // Index of the transaction to update
          "updatedFields": {
            "date": "New date value",
            // Other updated fields
          }
        }
      ]
    }`;
}
