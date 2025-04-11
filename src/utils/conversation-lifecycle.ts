// src/utils/conversation-lifecycle.ts
import { get } from 'svelte/store';
import {
	conversationActive,
	conversationMessages,
	conversationProgress,
	extractedTransactions,
	conversationStatus,
	isProcessing,
	initialPromptSent
} from './conversation-store';
import type { Transaction } from '../types';
// --- IMPORT addTransactions from the main store ---
import { addTransactions } from '../store';

/**
 * Resets all conversation stores to their initial states.
 */
export function resetConversationState(): void {
	console.log('[resetConversationState] Resetting chat state.');
	conversationActive.set(false);
	conversationMessages.set([]);
	conversationProgress.set(0);
	conversationStatus.set('');
	extractedTransactions.set([]); // Clear temporary transactions
	isProcessing.set(false);
	initialPromptSent.set(false);
}

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
	conversationActive.set(true);
}

/**
 * Ends the conversation, adds extracted transactions to the main store, and resets state.
 * @returns The array of extracted Transactions that were added.
 */
export function completeConversation(): Transaction[] {
	console.log('[completeConversation] Completing conversation.');
	// Get transactions from the temporary chat store
	const transactionsToAdd = get(extractedTransactions);

	// --- Add transactions to the main application store ---
	if (transactionsToAdd && transactionsToAdd.length > 0) {
		console.log(
			`[completeConversation] Adding ${transactionsToAdd.length} transactions to main store.`
		);
		// Call the action imported from the main store
		addTransactions(transactionsToAdd);
	} else {
		console.log(`[completeConversation] No transactions to add.`);
	}
	// ---

	resetConversationState(); // Reset chat state afterwards
	return transactionsToAdd; // Return the transactions that were processed
}

/**
 * Aborts the conversation and resets state without adding transactions.
 */
export function abortConversation(): void {
	console.log('[abortConversation] Aborting conversation.');
	resetConversationState(); // Just reset, don't add
}
