// src/lib/services/ai/conversation.ts
import { writable, get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { ollamaChat } from './llm-client';
import { getSystemPrompt, getSummaryPrompt } from './prompts';
import { extractTransactionsFromText } from './extraction';
import { textLooksLikeTransaction } from '$lib/utils/helpers';

// Conversation stores
export const conversationMessages = writable<{ role: string; content: string }[]>([]);
export const conversationStatus = writable('');
export const isProcessing = writable(false);
export const conversationProgress = writable(0);
export const extractedTransactions = writable<Transaction[]>([]);

// Internal state
let initialPromptSent = false;

/**
 * Initializes the conversation state and adds the welcome message.
 */
export function initializeConversation(): void {
	resetConversationState();
	console.log('[initializeConversation] Initializing chat.');
	conversationMessages.set([
		{
			role: 'assistant',
			content:
				"Hello! I'm your AI Transaction Assistant. Paste your transaction data, type it out, or describe your spending, and I'll help you organize it. How can I help you get started?"
		}
	]);
}

/**
 * Resets all conversation stores to their initial states.
 */
export function resetConversationState(): void {
	console.log('[resetConversationState] Resetting chat state.');
	conversationMessages.set([]);
	conversationProgress.set(0);
	conversationStatus.set('');
	extractedTransactions.set([]);
	isProcessing.set(false);
	initialPromptSent = false;
}

/**
 * Ends the conversation and returns extracted transactions.
 * @returns The array of extracted Transactions.
 */
export function completeConversation(): Transaction[] {
	console.log('[completeConversation] Completing conversation.');
	const transactionsToAdd = get(extractedTransactions);
	resetConversationState();
	return transactionsToAdd;
}

/**
 * Aborts the conversation and resets state without returning transactions.
 */
export function abortConversation(): void {
	console.log('[abortConversation] Aborting conversation.');
	resetConversationState();
}

/**
 * Sends a user message, gets the LLM response, and updates the conversation state.
 */
export async function sendUserMessage(message: string): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[sendUserMessage] Already processing, message ignored:', message);
		return;
	}

	console.log('[sendUserMessage] Adding user message:', message);
	conversationMessages.update((msgs) => [...msgs, { role: 'user', content: message }]);

	conversationStatus.set('Thinking...');
	isProcessing.set(true);

	let assistantResponse = '';
	const today = new Date().toISOString().split('T')[0]; // Get today's date string YYYY-MM-DD

	try {
		if (!initialPromptSent && textLooksLikeTransaction(message)) {
			// Handle initial transaction extraction
			await processInitialData(message);
			return; // processInitialData will update the messages
		}

		const visibleMessages = get(conversationMessages);
		const apiMessages = [{ role: 'system', content: getSystemPrompt(today) }, ...visibleMessages];

		console.log('[sendUserMessage] Calling ollamaChat...');
		assistantResponse = await ollamaChat(apiMessages);
		console.log(
			'[sendUserMessage] Received response:',
			assistantResponse.substring(0, 100) + '...'
		);

		// Check for problematic first response (repeating greeting)
		if (!initialPromptSent) {
			const lowerResponse = assistantResponse.toLowerCase().trim();
			const lowerGreeting = "hello! i'm your ai transaction assistant.";
			if (!assistantResponse || lowerResponse.startsWith(lowerGreeting)) {
				console.warn(
					'[sendUserMessage] Received empty or initial greeting as FIRST response:',
					assistantResponse
				);
				assistantResponse = `I see you mentioned "${message}". Could you please provide a bit more detail like the date, amount, and purpose?`;
			}
		}

		// Look for potential transactions in the user's message after first message
		if (initialPromptSent && textLooksLikeTransaction(message)) {
			try {
				const potentialTransactions = await extractTransactionsFromText(message);
				if (potentialTransactions.length > 0) {
					extractedTransactions.update((txns) => [...txns, ...potentialTransactions]);
					// Could optionally add confirmation to the assistant's response here
				}
			} catch (error) {
				console.error('[sendUserMessage] Error extracting transactions:', error);
			}
		}
	} catch (error) {
		console.error('Error sending user message / getting response:', error);
		assistantResponse =
			"I'm having some trouble processing that. Could you try rephrasing or providing more details?";
		conversationStatus.set('Error');
	} finally {
		if (!assistantResponse || assistantResponse.trim() === '') {
			assistantResponse =
				"I'm sorry, I couldn't process that correctly. Could you rephrase or provide more details about your transaction?";
		}

		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: assistantResponse }
		]);

		if (!initialPromptSent) {
			initialPromptSent = true;
			console.log('[sendUserMessage] Marked initialPromptSent = true');
		}
		conversationStatus.set('');
		isProcessing.set(false);
	}
}

/**
 * Process initial transaction data input.
 */
async function processInitialData(text: string): Promise<void> {
	console.log('[processInitialData] Processing initial data:', text);
	conversationProgress.set(20);
	conversationStatus.set('Analyzing your initial data...');

	let assistantResponse = '';
	let success = false;
	const today = new Date().toISOString().split('T')[0]; // Get today's date

	try {
		console.log('[processInitialData] Extracting transactions...');
		const transactions = await extractTransactionsFromText(text);
		console.log('[processInitialData] Extraction result:', transactions);

		if (transactions && transactions.length > 0) {
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
				const clarificationPrompt = `The user just provided this input: "${text}". I extracted the following partial data: ${JSON.stringify(transactions)}. Based on the system prompt rules (asking for missing details), ask a friendly, specific question to get the missing details (like the purpose or date). DO NOT greet the user again.`;
				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMessages,
					{ role: 'system', content: clarificationPrompt }
				];

				console.log('[processInitialData] Requesting clarification for incomplete transactions...');
				assistantResponse = await ollamaChat(apiMessages);
				console.log('[processInitialData] Clarification response received');
			} else {
				// Format a nice confirmation message
				const txn = transactions[0];
				const amountValue = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount;
				const formattedAmount = !isNaN(amountValue) ? amountValue.toFixed(2) : 'an unknown amount';
				assistantResponse = `Got it! I've recorded that you spent $${formattedAmount} ${txn.description !== 'unknown' ? `at ${txn.description}` : ''} on ${formatDateForDisplay(txn.date)}. This has been categorized as an expense.${transactions.length > 1 ? ` (Plus ${transactions.length - 1} additional transaction${transactions.length > 2 ? 's' : ''})` : ''}`;
				console.log('[processInitialData] Using standard response for complete transactions');
			}
			success = true;
		} else {
			console.log('[processInitialData] No transactions extracted.');
			const looksLikeTxn = textLooksLikeTransaction(text);
			console.log('[processInitialData] Does input look like transaction?', looksLikeTxn);

			if (looksLikeTxn) {
				conversationStatus.set('Needs clarification...');
				const clarificationPrompt = `The user provided this input: "${text}". My extraction process failed, but it looks like a transaction. Based on the system prompt rules (asking for missing details instead of failing), please formulate a friendly question to the user to understand what transaction they meant. Ask for details like amount, date, and purpose/description. IMPORTANT: Do NOT repeat the initial assistant greeting. Just ask the question directly.`;
				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMessages,
					{ role: 'system', content: clarificationPrompt }
				];

				console.log('[processInitialData] Requesting clarification for failed extraction...');
				assistantResponse = await ollamaChat(apiMessages);
				console.log('[processInitialData] Clarification response received');
			} else {
				conversationStatus.set('No transaction data detected.');
				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMessages,
					{
						role: 'system',
						content:
							"The user's message didn't seem to contain transaction data. Respond conversationally and ask how you can help with their transactions. Do not repeat the initial greeting."
					}
				];

				console.log('[processInitialData] Requesting generic response...');
				assistantResponse = await ollamaChat(apiMessages);
				console.log('[processInitialData] Generic response received');
			}

			// Check for problematic response
			if (
				!assistantResponse ||
				assistantResponse.trim() === '' ||
				assistantResponse.toLowerCase().includes("hello! i'm your ai transaction assistant")
			) {
				console.warn('[processInitialData] Received problematic response, using fallback...');
				assistantResponse = `I saw you mentioned "${text}". Could you please provide more details about this transaction? I need to know the date, amount, and purpose.`;
				success = false;
			} else {
				success = true;
			}
		}

		console.log('[processInitialData] Final response determined');
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
					'I encountered an issue while analyzing that data. Could you try rephrasing or providing the information in a different format?'
			}
		]);
		conversationStatus.set('Error during analysis.');
		success = false;
	} finally {
		conversationProgress.set(100);
		setTimeout(() => conversationProgress.set(0), 1500);
		conversationStatus.set('');
		initialPromptSent = success;
		console.log(`[processInitialData] Complete, initialPromptSent = ${initialPromptSent}`);
	}
}

/**
 * Format a date for display to users
 */
function formatDateForDisplay(dateStr: string): string {
	if (!dateStr || dateStr === 'unknown') return 'an unknown date';

	try {
		const date = new Date(dateStr);
		if (!isNaN(date.getTime())) {
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		}
		return dateStr;
	} catch (e) {
		return dateStr;
	}
}

/**
 * Generates and adds a transaction summary to the conversation.
 */
export async function generateSummary(): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[generateSummary] Already processing, summary request ignored.');
		return;
	}

	const transactions = get(extractedTransactions);

	if (transactions.length === 0) {
		const assistantMsg =
			get(conversationMessages).length <= 2
				? "I haven't logged any specific transactions yet. Please describe your income or expenses first!"
				: "I haven't logged any transactions from our conversation yet. You can ask me to save specific ones we've discussed.";
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content: assistantMsg }]);
		return;
	}

	conversationStatus.set('Generating summary...');
	isProcessing.set(true);
	let summaryResponse = '';
	const today = new Date().toISOString().split('T')[0]; // Get today's date

	try {
		const summaryPrompt = getSummaryPrompt(transactions);
		const summaryMessages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{
				role: 'user',
				content: `Here are the transactions I have logged so far (${transactions.length} total). Please summarize them for me:\n\n${JSON.stringify(transactions, null, 2)}`
			}
		];

		console.log('[generateSummary] Calling ollamaChat for summary...');
		summaryResponse = await ollamaChat(summaryMessages);
		console.log('[generateSummary] Summary response received');

		if (!summaryResponse || summaryResponse.trim() === '') {
			// Generate a basic summary if LLM fails
			const incomeCount = transactions.filter((t) => t.direction === 'in').length;
			const expenseCount = transactions.filter((t) => t.direction === 'out').length;
			const totalAmount = transactions.reduce((sum, t) => {
				const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount;
				return sum + (isNaN(amount) ? 0 : amount);
			}, 0);

			summaryResponse = `Here's a summary of your transactions:
- Total number of transactions: ${transactions.length}
- Income transactions: ${incomeCount}
- Expense transactions: ${expenseCount}
- Total amount: $${totalAmount.toFixed(2)}

Do you want to add these transactions to your main list now?`;
		}
	} catch (error) {
		console.error('Error generating transaction summary:', error);
		const incomeCount = transactions.filter((t) => t.direction === 'in').length;
		const expenseCount = transactions.filter((t) => t.direction === 'out').length;
		summaryResponse = `I encountered an error generating a detailed summary, but here's the basic count:\n- Logged ${transactions.length} transaction(s)\n- ${incomeCount} income/deposit(s)\n- ${expenseCount} expense(s)\n\nWould you like to use these transactions?`;
		conversationStatus.set('Error Generating Summary');
	} finally {
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: summaryResponse }
		]);
		conversationStatus.set('');
		isProcessing.set(false);
	}
}
