// src/utils/conversation.service.ts
import { get } from 'svelte/store';
import {
	conversationMessages,
	conversationStatus,
	isProcessing,
	initialPromptSent,
	extractedTransactions
} from './conversation-store';
// Import specific prompts needed
import { getSystemPrompt, getSummaryPrompt } from './llm-prompts';
import { ollamaChat } from './llm-client';
// Import utils if needed by logic below (userInputLooksLikeTransaction might be removed if relying on LLM)
// import { userInputLooksLikeTransaction } from './conversation-utils';
// import { extractTransactionsFromText } from './transaction-extractor'; // Not used directly in sendUserMessage anymore

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
	let currentInitialPromptSent = get(initialPromptSent);
	const today = new Date().toISOString().split('T')[0]; // Get today's date string YYYY-MM-DD

	try {
		const visibleMessages = get(conversationMessages);
		// Pass today's date to getSystemPrompt
		const apiMessages = [{ role: 'system', content: getSystemPrompt(today) }, ...visibleMessages];

		console.log('[sendUserMessage] Calling ollamaChat...');
		assistantResponse = await ollamaChat(apiMessages);
		console.log('[sendUserMessage] Received response:', assistantResponse.substring(0, 100) + '...');

		// Check for problematic first response (repeating greeting)
		if (!currentInitialPromptSent) {
			const lowerResponse = assistantResponse.toLowerCase().trim();
			const lowerGreeting = "hello! i'm your ai transaction assistant.";
			if (!assistantResponse || lowerResponse.startsWith(lowerGreeting)) {
				console.warn('[sendUserMessage] Received empty or initial greeting as FIRST response:', assistantResponse);
				assistantResponse = `I see you mentioned "${message}". Could you please provide a bit more detail like the date, amount, and purpose?`;
			}
		}

        // --- Deferred Extraction Logic ---
        // Decide where/how to trigger extraction based on conversation flow.
        // Example: Could check if assistantResponse asks to save or contains JSON.
        // if (assistantResponse.toLowerCase().includes("shall i save this transaction?")) {
        //     const potentialTransactions = await extractTransactionsFromText(message); // Extract from user's previous message
        //     if (potentialTransactions.length > 0) {
        //         extractedTransactions.update(txns => [...txns, ...potentialTransactions]);
        //         // Optionally modify assistantResponse to confirm saving
        //     }
        // }
        // --- End Deferred Extraction ---


	} catch (error) {
		console.error('Error sending user message / getting response:', error);
		assistantResponse = "I'm having some trouble processing that. Could you try rephrasing or providing more details?";
		conversationStatus.set('Error');
	} finally {
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content: assistantResponse }]);

		if (!currentInitialPromptSent) {
			initialPromptSent.set(true);
			console.log('[sendUserMessage] Marked initialPromptSent = true');
		}
		conversationStatus.set('');
		isProcessing.set(false);
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
        // ... (no transactions message logic) ...
		const assistantMsg = get(conversationMessages).length <= 2
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
		const summaryPrompt = getSummaryPrompt(transactions); // Prompt now includes stats
		const summaryMessages = [
            // Pass date context to system prompt
			{ role: 'system', content: getSystemPrompt(today) },
			// Provide transaction context and ask for summary
			{
				role: 'user',
				content: `Here are the transactions I have logged so far (${transactions.length} total). Please summarize them for me:\n\n${JSON.stringify(transactions, null, 2)}`
                // Alternatively, use the summaryPrompt variable if it's preferred:
                // content: summaryPrompt
			}
		];

		console.log('[generateSummary] Calling ollamaChat for summary...');
		summaryResponse = await ollamaChat(summaryMessages);

	} catch (error) {
        // ... (error handling and fallback summary) ...
		console.error('Error generating transaction summary:', error);
		const incomeCount = transactions.filter((t) => t.direction === 'in').length;
		const expenseCount = transactions.filter((t) => t.direction === 'out').length;
		summaryResponse = `I encountered an error generating a detailed summary, but here's the basic count:\n- Logged ${transactions.length} transaction(s)\n- ${incomeCount} income/deposit(s)\n- ${expenseCount} expense(s)\n\nWould you like to use these transactions?`;
		conversationStatus.set('Error Generating Summary');
	} finally {
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content: summaryResponse }]);
		conversationStatus.set('');
		isProcessing.set(false);
	}
}
