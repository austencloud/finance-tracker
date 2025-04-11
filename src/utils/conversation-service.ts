// src/utils/conversation.service.ts
import { get } from 'svelte/store';
import {
	conversationMessages,
	conversationStatus,
	isProcessing,
	initialPromptSent,
	extractedTransactions // Import store for summary context
} from './conversation-store';
import { getSystemPrompt, getSummaryPrompt } from './llm-prompts';
import { ollamaChat } from './llm-client'; // Use the client
import { userInputLooksLikeTransaction } from './conversation-utils';
import { extractTransactionsFromText } from './transaction-extractor'; // Import for potential future use

/**
 * Sends a user message, gets the LLM response, and updates the conversation state.
 */
export async function sendUserMessage(message: string): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[sendUserMessage] Already processing, message ignored:', message);
		return; // Prevent concurrent processing
	}

	// Add user message to conversation FIRST
	console.log('[sendUserMessage] Adding user message:', message);
	conversationMessages.update((msgs) => [...msgs, { role: 'user', content: message }]);

	conversationStatus.set('Thinking...');
	isProcessing.set(true);

	let assistantResponse = '';
	let currentInitialPromptSent = get(initialPromptSent); // Check state before async call

	try {
		// Always use the main chat logic, relying on System Prompt
		const visibleMessages = get(conversationMessages);
		const apiMessages = [{ role: 'system', content: getSystemPrompt() }, ...visibleMessages];

		console.log('[sendUserMessage] Calling ollamaChat...');
		assistantResponse = await ollamaChat(apiMessages);
		console.log(
			'[sendUserMessage] Received response:',
			assistantResponse.substring(0, 100) + '...'
		);

		// Basic check if the response is problematic (especially for the first response)
		if (!currentInitialPromptSent) {
			// Only apply strict check on the very first response
			const lowerResponse = assistantResponse.toLowerCase().trim();
			const lowerGreeting = "hello! i'm your ai transaction assistant.";
			if (!assistantResponse || lowerResponse.startsWith(lowerGreeting)) {
				console.warn(
					'[sendUserMessage] Received empty or initial greeting as FIRST response:',
					assistantResponse
				);
				// Fallback response if LLM fails basic instruction following on first turn
				assistantResponse = `I see you mentioned "${message}". Could you please provide a bit more detail like the date, amount, and purpose?`;
			}
		}
	} catch (error) {
		console.error('Error sending user message / getting response:', error);
		assistantResponse =
			"I'm having some trouble processing that. Could you try rephrasing or providing more details?";
		conversationStatus.set('Error');
	} finally {
		// Add the determined assistant response to the chat
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: assistantResponse }
		]);

		// Mark the initial prompt as "handled" after the first attempt
		if (!currentInitialPromptSent) {
			initialPromptSent.set(true);
			console.log('[sendUserMessage] Marked initialPromptSent = true');
		}
		conversationStatus.set(''); // Clear thinking status
		isProcessing.set(false); // Allow new messages
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

	try {
		const summaryPrompt = getSummaryPrompt(transactions);
		// Construct messages for summary generation context
		const summaryMessages = [
			{ role: 'system', content: getSystemPrompt() },
			// Provide transaction context *before* asking for summary
			{
				role: 'user',
				content: `Here are the transactions I have logged so far, please summarize them:\n${JSON.stringify(transactions, null, 2)}`
			}
			// { role: 'user', content: summaryPrompt }, // The prompt might be better merged or replaced by the above user message
		];

		console.log('[generateSummary] Calling ollamaChat for summary...');
		summaryResponse = await ollamaChat(summaryMessages);
	} catch (error) {
		console.error('Error generating transaction summary:', error);
		const incomeCount = transactions.filter((t) => t.category !== 'Expenses').length;
		const expenseCount = transactions.filter((t) => t.category === 'Expenses').length;
		summaryResponse = `I encountered an error generating a detailed summary, but here's the basic count:\n- Extracted ${transactions.length} transaction(s)\n- ${incomeCount} income/deposit(s)\n- ${expenseCount} expense(s)\n\nWould you like to use these transactions?`;
		conversationStatus.set('Error Generating Summary');
	} finally {
		// Add the summary (or error message) to the chat
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: summaryResponse }
		]);
		conversationStatus.set('');
		isProcessing.set(false);
	}
}
