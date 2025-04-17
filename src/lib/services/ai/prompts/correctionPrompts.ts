// src/lib/services/ai/correctionPrompts.ts
import type { Category, Transaction } from '$lib/types/types'; // Assuming types are here

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
	// Ensure amount is treated as a number before toFixed
	const amountValue = typeof targetTransaction.amount === 'number' ? targetTransaction.amount : 0;
	// Handle the categories array
	const categoryDisplay =
		targetTransaction.categories && targetTransaction.categories.length > 0
			? targetTransaction.categories.join(', ')
			: '(none)'; // Display '(none)' if the array is empty or doesn't exist

	const transactionContext = `
Transaction Details to Correct:
- ID: ${targetTransaction.id}
- Date: ${targetTransaction.date}
- Description: ${targetTransaction.description}
- Amount: ${amountValue.toFixed(2)}
- Category/Categories: ${categoryDisplay} // Display category/categories
- Type: ${targetTransaction.type}
- Direction: ${targetTransaction.direction}
- Notes: ${targetTransaction.notes || '(none)'}
    `.trim();

	// Define the valid fields the user can correct
	const validFields = "'amount', 'date', 'description', 'categories'"; // Keep 'categories' as the target field name

	// Define the expected JSON output structure
	const jsonStructure = `
{
  "correction_possible": boolean, // true if the user message seems like a correction request, false otherwise
  "target_field": string, // ONE of ${validFields} or 'unknown' if the field isn't clear
  "new_value": string | number | string[] | null // The new value extracted. Use number for amount, string for date/description, string array for categories. Return null if value unclear.
}
    `.trim();

	// Get today's date for resolving relative dates
	// Use the timezone where the code is running (server-side or client-side)
	const today = new Date();
	const todayDateString = today.toISOString().split('T')[0];
	// Get yesterday's date
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	const yesterdayDateString = yesterday.toISOString().split('T')[0];

	return `
You are a precise assistant helping to correct transaction details.
The user is likely trying to correct the following transaction:

${transactionContext}

Analyze the user's latest message below and determine if they are requesting a correction to one of the transaction fields. Assume today is ${todayDateString}.

User Message: "${userCorrectionMessage}"

Your task is to parse the user's message and determine:
1.  If a correction is being requested ('correction_possible').
2.  Which specific field the user wants to change ('target_field'). It must be one of: ${validFields}. If unsure, use "unknown".
3.  What the new value for that field should be ('new_value'). Extract the value accurately.
    - For 'amount', provide a positive number (e.g., 25.50). If the user only mentions the amount without specifying field, assume it's 'amount'.
    - For 'date', provide the date as a 'YYYY-MM-DD' string. Resolve relative dates like 'today' (${todayDateString}), 'yesterday' (${yesterdayDateString}) if possible. If resolution fails, return null.
    - For 'description', provide the new text.
    - For 'categories', provide ONE category name exactly as it appears in this list: [${availableCategories.join(', ')}]. Match case-insensitively but return the correct casing from the list. If the user mentions a category not in the list, or if the intent is unclear, set target_field to 'categories' but new_value to null.
    - If the new value cannot be determined clearly for the identified field, set new_value to null.

Output ONLY the following JSON object, with no other text, explanations, or markdown formatting (\`\`\`) before or after it:
${jsonStructure}


Example 1:
User Message: "no the amount was 15.75"
Output JSON:
{
  "correction_possible": true,
  "target_field": "amount",
  "new_value": 15.75
}

Example 2:
User Message: "change date to yesterday"
Output JSON:
{
  "correction_possible": true,
  "target_field": "date",
  "new_value": "${yesterdayDateString}"
}

Example 3:
User Message: "set category to Expenses"
Available Categories: ["Income", "Expenses", "Groceries"]
Output JSON:
{
  "correction_possible": true,
  "target_field": "categories",
  "new_value": "Expenses" // Keep as single string for now based on example, adjust if multi-category needed
}

Example 4:
User Message: "that description should be 'Dinner with friends'"
Output JSON:
{
  "correction_possible": true,
  "target_field": "description",
  "new_value": "Dinner with friends"
}

Example 5:
User Message: "that's correct"
Output JSON:
{
  "correction_possible": false,
  "target_field": "unknown",
  "new_value": null
}

Example 6:
User Message: "make it food"
Available Categories: ["Groceries", "Restaurants", "Expenses"]
Output JSON:
{
  "correction_possible": true,
  "target_field": "categories",
  "new_value": null // Category "food" not in the list
}
`.trim();
}
