import { writable, get } from 'svelte/store';
import type { Transaction } from '../types';
import { getSystemPrompt, getSummaryPrompt, getExtractionPrompt } from './llm-prompts';
import { parseTransactionsFromLLMResponse } from './llm-transaction-parser';
import { generateTransactionId } from './helpers';
import { categorizeTransaction } from './categorizer';

// Store for conversation state
export const conversationActive = writable(false);
export const conversationMessages = writable<{ role: string; content: string }[]>([]);
export const conversationProgress = writable(0);
export const extractedTransactions = writable<Transaction[]>([]);
export const conversationStatus = writable('');

// Track background processing state
let isProcessingData = false;
let initialPromptSent = false; // Ensure initial prompt isn't sent multiple times

/**
 * Initializes the conversation state and adds the welcome message
 * if it hasn't been initialized yet.
 */
export function startOrInitializeConversation(): void {
	if (get(conversationMessages).length === 0) {
		conversationMessages.set([
			{
				role: 'assistant',
				content:
					"Hello! I'm your AI Transaction Assistant. Paste your transaction data, type it out, or describe your spending, and I'll help you organize it. How can I help you get started?"
			}
		]);
		conversationActive.set(true); // Indicate chat mode is active
		extractedTransactions.set([]); // Clear any previous transactions
		conversationProgress.set(0);
		conversationStatus.set('');
		initialPromptSent = false; // Reset flag
	}
}

/**
 * Process transactions from the first user message containing data.
 * Uses a simpler logic: Extract, confirm receipt, and let the next turn handle clarifications if needed.
 */
// src/utils/llm-conversation-manager.ts
// src/utils/llm-conversation-manager.ts

async function processInitialData(text: string): Promise<void> {
	console.log('[processInitialData] ATTEMPT 3 START processing:', text);
	if (isProcessingData) {
		console.log('[processInitialData] Already processing, returning.');
		return;
	}

	isProcessingData = true;
	conversationProgress.set(20);
	conversationStatus.set('Analyzing your initial data...');

	let assistantResponse = '';
	let success = false; // Flag to track if we got a proper response path

	try {
		console.log('[processInitialData] Calling extractTransactionsFromTextInternal...');
		const transactions = await extractTransactionsFromTextInternal(text);
		console.log(
			'[processInitialData] extractTransactionsFromTextInternal raw result:',
			transactions
		);

		if (transactions && Array.isArray(transactions) && transactions.length > 0) {
			console.log('[processInitialData] Transactions found:', transactions.length);
			extractedTransactions.update((txns) => [...txns, ...transactions]);
			conversationProgress.set(80);
			conversationStatus.set(`Processed ${transactions.length} potential transaction(s).`);

			const isIncomplete = transactions.some(
				(t) =>
					t.description === 'unknown' ||
					t.description === '' ||
					t.date === 'unknown' ||
					t.date === '' ||
					t.amount === 0 ||
					t.direction === 'unknown'
			);
			console.log('[processInitialData] Is transaction list incomplete?', isIncomplete);

			if (isIncomplete) {
				// Let's try explicitly asking LLM to formulate the question *now*
				const clarificationPrompt = `The user just provided this input: "${text}". I extracted the following partial data: ${JSON.stringify(transactions)}. Based on the system prompt rules (asking for missing details), ask a friendly, specific question to get the missing details (like the purpose or date). DO NOT greet the user again.`;
				const visibleMessages = get(conversationMessages); // Includes the user message 'text'
				const apiMessages = [
					{ role: 'system', content: getSystemPrompt() },
					...visibleMessages, // Full history
					{ role: 'system', content: clarificationPrompt } // Guide this specific response
				];
				console.log(
					'[processInitialData] Calling sendMessagesToLLM for *incomplete* transaction clarification...'
				);
				assistantResponse = await sendMessagesToLLM(apiMessages);
				console.log(
					'[processInitialData] Incomplete clarification response received:',
					assistantResponse
				);
			} else {
				// Seemingly complete
				assistantResponse = `Got it! I've recorded ${transactions.length} transaction(s) based on your input: ${JSON.stringify(transactions)}. You can ask for a summary or add more transactions.`;
				console.log('[processInitialData] Set response for complete transaction.');
			}
			success = true; // Mark success
		} else {
			console.log('[processInitialData] No transactions extracted.');
			const looksLikeTxn = userInputLooksLikeTransaction(text);
			console.log('[processInitialData] Does input look like transaction?', looksLikeTxn);

			if (looksLikeTxn) {
				conversationStatus.set('Needs clarification...');
				// Explicitly tell LLM NOT to greet.
				const clarificationPrompt = `The user provided this input: "${text}". My extraction process failed, but it looks like a transaction. Based on the system prompt rules (asking for missing details instead of failing), please formulate a friendly question to the user to understand what transaction they meant. Ask for details like amount, date, and purpose/description. IMPORTANT: Do NOT repeat the initial assistant greeting. Just ask the question directly.`;

				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					{ role: 'system', content: getSystemPrompt() }, // Base rules
					...visibleMessages, // History including user input
					{ role: 'system', content: clarificationPrompt } // Specific instruction for this turn
				];

				console.log(
					'[processInitialData] Calling sendMessagesToLLM for FAILED extraction clarification...'
				);
				assistantResponse = await sendMessagesToLLM(apiMessages);
				console.log(
					'[processInitialData] Failed extraction clarification response received:',
					assistantResponse
				);
			} else {
				conversationStatus.set('No transaction data detected.');
				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					{ role: 'system', content: getSystemPrompt() },
					...visibleMessages,
					{
						role: 'system',
						content:
							"The user's message didn't seem to contain transaction data. Respond conversationally and ask how you can help with their transactions. Do not repeat the initial greeting."
					}
				];
				console.log('[processInitialData] Calling sendMessagesToLLM for generic response...');
				assistantResponse = await sendMessagesToLLM(apiMessages);
				console.log('[processInitialData] Generic response received:', assistantResponse);
			}
			// Check if the received response is problematic (e.g., empty or contains the greeting)
			if (
				!assistantResponse ||
				assistantResponse.toLowerCase().includes("hello! i'm your ai transaction assistant")
			) {
				console.warn(
					'[processInitialData] Received empty or problematic response from LLM for clarification/generic:',
					assistantResponse
				);
				// Fallback response if LLM fails to follow instructions
				assistantResponse = `I saw you mentioned "${text}". Could you please provide a bit more detail like the date, amount, and purpose?`;
				success = false; // Mark as not fully successful
			} else {
				success = true; // Mark as successful LLM response generation
			}
		}

		console.log('[processInitialData] Final assistantResponse:', assistantResponse);
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: assistantResponse }
		]);
	} catch (error) {
		console.error('[processInitialData] Error:', error);
		conversationMessages.update((msgs) => [
			...msgs,
			{
				role: 'assistant',
				content:
					'I encountered an issue while analyzing that data. Could you please try rephrasing or pasting it again?'
			}
		]);
		conversationStatus.set('Error during analysis.');
	} finally {
		conversationProgress.set(100);
		setTimeout(() => conversationProgress.set(0), 1500);
		conversationStatus.set('');
		isProcessingData = false;
		// Only mark initial prompt sent if we successfully generated a meaningful response,
		// otherwise, let the next attempt try again.
		initialPromptSent = success;
		console.log(`[processInitialData] END, initialPromptSent set to: ${initialPromptSent}`);
	}
}

// Add logging to the extraction function too
async function extractTransactionsFromTextInternal(text: string): Promise<Transaction[]> {
	console.log('[extractTransactionsFromTextInternal] START extracting from:', text);
	const extractionPrompt = getExtractionPrompt(text);
	try {
		console.log(
			'[extractTransactionsFromTextInternal] Sending prompt to /api/generate:',
			extractionPrompt
		);
		const response = await fetch('http://localhost:11434/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'llama3',
				prompt: extractionPrompt,
				format: 'json',
				stream: false,
				raw: true
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('[extractTransactionsFromTextInternal] LLM API error status:', response.status);
			console.error('[extractTransactionsFromTextInternal] LLM API error body:', errorText);
			throw new Error(`LLM API error: ${response.status} - ${errorText}`);
		}
		const data = await response.json();
		console.log('[extractTransactionsFromTextInternal] Raw LLM response data:', data);

		let jsonString = '';
		if (typeof data.response === 'string') {
			jsonString = data.response;
		} else {
			console.warn(
				'[extractTransactionsFromTextInternal] LLM response content not found or not a string:',
				data
			);
			return [];
		}
		console.log('[extractTransactionsFromTextInternal] Raw LLM response string:', jsonString);

		// Clean the raw response string before parsing
		const startIndex = jsonString.indexOf('{');
		const endIndex = jsonString.lastIndexOf('}');
		let potentialJson = '';
		if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
			potentialJson = jsonString.substring(startIndex, endIndex + 1);
		} else {
			const arrayStartIndex = jsonString.indexOf('[');
			const arrayEndIndex = jsonString.lastIndexOf(']');
			if (arrayStartIndex !== -1 && arrayEndIndex !== -1 && arrayEndIndex >= arrayStartIndex) {
				const potentialArray = jsonString.substring(arrayStartIndex, arrayEndIndex + 1);
				try {
					JSON.parse(potentialArray); // Check if valid array
					potentialJson = `{ "transactions": ${potentialArray} }`; // Wrap it
				} catch (e) {
					console.warn(
						'[extractTransactionsFromTextInternal] Found array markers but content is not valid JSON array:',
						potentialArray
					);
					potentialJson = ''; // Reset if invalid
				}
			} else {
				console.warn(
					'[extractTransactionsFromTextInternal] Could not find valid JSON object/array markers in LLM response string:',
					jsonString
				);
				potentialJson = ''; // Reset if no markers
			}
		}

		if (!potentialJson) {
			console.log(
				'[extractTransactionsFromTextInternal] No valid JSON found after cleaning. Returning [].'
			);
			return [];
		}

		console.log('[extractTransactionsFromTextInternal] Attempting to parse JSON:', potentialJson);
		const parsedResult = parseTransactionsFromLLMResponse(potentialJson);
		console.log('[extractTransactionsFromTextInternal] Parsing result:', parsedResult);
		return parsedResult;
	} catch (error) {
		console.error('[extractTransactionsFromTextInternal] Error:', error);
		return [];
	}
}
/**
 * Send a user message in the conversation. Handles the initial message via processInitialData.
 */
export async function sendUserMessage(message: string): Promise<void> {
	// Add user message to conversation FIRST
	conversationMessages.update((msgs) => [...msgs, { role: 'user', content: message }]);

	// Check if this is the first message needing processing
	if (!initialPromptSent) {
		await processInitialData(message); // Let processInitialData handle the response
		return;
	}

	// If it's not the first message, proceed with normal chat interaction
	conversationStatus.set('Thinking...');

	try {
		// Get history *including* the message just added
		const visibleMessages = get(conversationMessages);
		// Construct messages for LLM (System Prompt + Full History)
		const apiMessages = [{ role: 'system', content: getSystemPrompt() }, ...visibleMessages];

		// Send to LLM
		const responseContent = await sendMessagesToLLM(apiMessages);

		// Add LLM response to conversation
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: responseContent }
		]);

		// Optional: Attempt to extract transactions from follow-up messages too?
		// This could potentially add transactions if the user clarifies inline.
		// const followUpTransactions = await extractTransactionsFromTextInternal(message);
		// if (followUpTransactions.length > 0) {
		//     // Maybe check for duplicates before adding?
		//     extractedTransactions.update(txns => [...txns, ...followUpTransactions]);
		//     console.log("Extracted transactions from follow-up:", followUpTransactions);
		//     // Maybe add a small note to the assistant's response? Needs careful handling.
		// }
	} catch (error) {
		console.error('Error sending user message:', error);
		conversationMessages.update((msgs) => [
			...msgs,
			{
				role: 'assistant',
				content:
					"I'm having some trouble processing that. Could you try rephrasing or providing more details?"
			}
		]);
	} finally {
		conversationStatus.set('');
	}
}

/**
 * Internal helper to extract transactions using the parser
 * (Assumes getExtractionPrompt and parseTransactionsFromLLMResponse are defined correctly)
 */
/**
 * Send messages to the LLM API
 */
async function sendMessagesToLLM(messages: { role: string; content: string }[]): Promise<string> {
	const response = await fetch('http://localhost:11434/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'llama3', // Ensure this model is available
			messages: messages,
			stream: false
			// Adjust Ollama parameters if needed
			// options: {
			//     temperature: 0.7
			// }
		})
	});

	if (!response.ok) {
		const errorBody = await response.text();
		console.error('LLM API Error Body:', errorBody);
		throw new Error(`LLM API error: ${response.status}`);
	}

	const data = await response.json();
	if (data.message && data.message.content) {
		return data.message.content;
	} else {
		console.error('Unexpected LLM response structure:', data);
		throw new Error('Unexpected LLM response structure');
	}
}

/**
 * Show a summary of extracted transactions
 */
export async function showTransactionSummary(): Promise<void> {
	if (isProcessingData) return;

	const transactions = get(extractedTransactions);

	if (transactions.length === 0) {
		conversationMessages.update((msgs) => [
			...msgs,
			{
				role: 'assistant',
				content: "I haven't extracted any transactions yet. Try pasting or describing some first!"
			}
		]);
		return;
	}

	conversationStatus.set('Generating summary...');
	try {
		const summaryPrompt = getSummaryPrompt(transactions); // Assumes getSummaryPrompt is defined correctly
		const summaryMessages = [
			{ role: 'system', content: getSystemPrompt() }, // Provide system context
			// Provide transaction context for summary generation
			{
				role: 'user',
				content: `Here are the transactions I've extracted so far: ${JSON.stringify(transactions)}`
			},
			{ role: 'user', content: summaryPrompt } // Ask for the summary based on the prompt
		];

		const summary = await sendMessagesToLLM(summaryMessages);

		conversationMessages.update((msgs) => [
			...msgs,
			{
				role: 'assistant',
				content: summary // Add the generated summary
			}
		]);
	} catch (error) {
		console.error('Error showing transaction summary:', error);
		// Fallback summary
		const incomeCount = transactions.filter((t) => t.category !== 'Expenses').length;
		const expenseCount = transactions.filter((t) => t.category === 'Expenses').length;
		const fallbackMessage = `I encountered an error generating a detailed summary, but here's the basic count:\n- Extracted ${transactions.length} transaction(s)\n- ${incomeCount} income/deposit(s)\n- ${expenseCount} expense(s)\n\nWould you like to use these transactions?`;
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: fallbackMessage }
		]);
	} finally {
		conversationStatus.set('');
	}
}

/**
 * Finish the conversation and return extracted transactions
 */
export function finishConversation(): Transaction[] {
	const transactions = get(extractedTransactions);
	resetConversationState(); // Use a helper to reset
	return transactions;
}

/**
 * Cancel the conversation without returning transactions
 */
export function cancelConversation(): void {
	resetConversationState(); // Use a helper to reset
}

/**
 * Helper function to reset conversation state
 */
function resetConversationState(): void {
	conversationActive.set(false);
	conversationMessages.set([]);
	conversationProgress.set(0);
	conversationStatus.set('');
	extractedTransactions.set([]);
	isProcessingData = false;
	initialPromptSent = false;
}

/**
 * Helper function to check if user input looks like a transaction
 */
function userInputLooksLikeTransaction(text: string): boolean {
	const lowerText = text.toLowerCase();
	// Added more keywords and slightly improved date/amount regex
	const hasAmount =
		/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd|cad|eur|gbp)/i.test(
			lowerText
		) || /\b\d+\b/.test(lowerText); // Look for currency symbols OR numbers
	const hasKeyword =
		/\b(spent|paid|bought|sold|received|deposit|income|expense|cost|got|transfer|sent|charge|fee|payment|salary|invoice|refund)\b/i.test(
			lowerText
		);
	const hasDate =
		/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}|\b(yesterday|today|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
			lowerText
		);

	// Require an amount OR (a keyword AND a date)
	return hasAmount || (hasKeyword && hasDate);
}

// Ensure necessary functions/types are imported if parseTransactionsFromLLMResponse isn't in this file
// import { parseTransactionsFromLLMResponse } from './llm-transaction-parser';
// import { getExtractionPrompt, getSummaryPrompt, getSystemPrompt } from './llm-prompts';
// import type { Transaction } from '../types';
