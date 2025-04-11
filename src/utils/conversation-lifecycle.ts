// src/utils/conversation.lifecycle.ts
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

/**
 * Resets all conversation stores to their initial states.
 */
export function resetConversationState(): void {
	console.log('[resetConversationState] Resetting chat state.');
	conversationActive.set(false);
	conversationMessages.set([]);
	conversationProgress.set(0);
	conversationStatus.set('');
	extractedTransactions.set([]);
	isProcessing.set(false);
	initialPromptSent.set(false); // Reset for next time chat is opened
}

/**
 * Initializes the conversation state and adds the welcome message.
 */
export function initializeConversation(): void {
	// Reset state first ensures clean start even if called multiple times
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
	// isProcessing, initialPromptSent are already false from reset
}

/**
 * Ends the conversation, retrieves extracted transactions, and resets state.
 * @returns The array of extracted Transactions.
 */
export function completeConversation(): Transaction[] {
	console.log('[completeConversation] Completing conversation.');
	const transactions = get(extractedTransactions);
	resetConversationState();
	return transactions;
}

/**
 * Aborts the conversation and resets state without returning transactions.
 */
export function abortConversation(): void {
	console.log('[abortConversation] Aborting conversation.');
	resetConversationState();
}
