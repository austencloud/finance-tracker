// src/lib/services/ai/conversation/helpers.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { ollamaChat } from '../llm-client';
import { getSystemPrompt } from '../prompts';
import { extractTransactionsFromText } from '../extraction';
import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import {
	conversationMessages,
	conversationStatus,
	isProcessing,
	conversationProgress,
	extractedTransactions,
	getState,
	setState
} from '../conversation';

import { BULK_DATA_THRESHOLD_LINES, BULK_DATA_THRESHOLD_LENGTH } from './constants';

/**
 * Safely adds an assistant message to the conversation, with locking to prevent race conditions
 */
export function safeAddAssistantMessage(content: string): void {
	const { messageInProgress } = getState();

	if (messageInProgress) {
		console.warn('[safeAddAssistantMessage] Locked, skipping:', content);
		return;
	}

	setState({ messageInProgress: true });

	try {
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content }]);
	} finally {
		setTimeout(() => {
			setState({ messageInProgress: false });
		}, 100);
	}
}

/**
 * Formats a date string for display in a human-readable format
 */
export function formatDateForDisplay(dateStr: string): string {
	if (!dateStr || dateStr === 'unknown') return 'an unknown date';

	try {
		const resolvedDate = resolveAndFormatDate(dateStr);
		if (resolvedDate !== 'unknown' && resolvedDate !== dateStr) {
			const d = new Date(resolvedDate + 'T00:00:00');
			if (!isNaN(d.getTime())) {
				return d.toLocaleDateString('en-US', {
					weekday: 'long',
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				});
			}
		}

		const d = new Date(dateStr + 'T00:00:00');
		if (!isNaN(d.getTime())) {
			return d.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		}

		return dateStr;
	} catch {
		return dateStr;
	}
}

/**
 * Checks if user input appears to be bulk data
 */
export function isBulkData(message: string): boolean {
	const messageLines = message.split('\n').length;
	const messageLength = message.length;

	return (
		(messageLines > BULK_DATA_THRESHOLD_LINES || messageLength > BULK_DATA_THRESHOLD_LENGTH) &&
		textLooksLikeTransaction(message)
	);
}

/**
 * Starts the processing state and adds the user message to the conversation
 */
export function startProcessing(message: string): void {
	conversationMessages.update((msgs) => [...msgs, { role: 'user', content: message }]);
	conversationStatus.set('Thinking...');
	isProcessing.set(true);
}

/**
 * Finalizes the processing state and adds the assistant response to the conversation
 */
export function finishProcessing(assistantResponse: string): void {
	const { initialPromptSent } = getState();

	if (!assistantResponse || !assistantResponse.trim()) {
		assistantResponse = "Sorry, I couldn't process that properly. Could you try again?";
	}

	conversationProgress.set(0);
	safeAddAssistantMessage(assistantResponse);

	// Update initialPromptSent if needed
	if (!initialPromptSent && textLooksLikeTransaction(assistantResponse)) {
		setState({ initialPromptSent: true });
	}

	isProcessing.set(false);
	if (get(conversationStatus) !== 'Error') {
		conversationStatus.set('');
	}
}

/**
 * Handles error scenarios during processing
 */
export function handleProcessingError(error: unknown): string {
	console.error('[sendUserMessage] Main processing error:', error);
	conversationStatus.set('Error');
	return "I'm having trouble processing that. Could you try rephrasing?";
}

/**
 * Processes the very first message if it looks like transaction data.
 */
export async function processInitialData(text: string): Promise<void> {
	conversationProgress.set(20);
	conversationStatus.set('Analyzing initial data...');
	let assistantResponse = '';
	let success = false;
	const today = new Date().toISOString().split('T')[0];

	try {
		const transactions = await extractTransactionsFromText(text);

		if (transactions && transactions.length > 0) {
			extractedTransactions.update((txns) => [...txns, ...transactions]);
			conversationProgress.set(80);

			const isIncomplete = transactions.some(
				(t) =>
					t.description === 'unknown' ||
					t.date === 'unknown' ||
					t.amount === 0 ||
					t.direction === 'unknown'
			);

			if (isIncomplete) {
				const clarPrompt = `... Ask concise, specific questions to get ONLY the missing details.`;
				const visibleMsgs = get(conversationMessages);
				const clarMessages = [
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMsgs,
					{ role: 'system', content: clarPrompt }
				];
				assistantResponse = await ollamaChat(clarMessages);
			} else {
				const { amount, description, date } = transactions[0];
				const amtNum =
					typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;

				assistantResponse = `Got it! Recorded $${amtNum.toFixed(2)} ${
					description !== 'unknown' ? `for "${description}" ` : ''
				}on ${formatDateForDisplay(date)}. ${
					transactions.length > 1 ? `(plus ${transactions.length - 1} more)` : ''
				} Anything else?`;
			}

			success = true;
		} else {
			assistantResponse = "Thanks for the info! It didn't look like a transaction...";
			success = false;
		}

		safeAddAssistantMessage(assistantResponse);
	} catch (err) {
		console.error('[processInitialData] error:', err);
		safeAddAssistantMessage('I had trouble analyzing that initial data...');
		conversationStatus.set('Error');
	} finally {
		conversationProgress.set(100);
		setTimeout(() => conversationProgress.set(0), 1500);
		conversationStatus.set(get(conversationStatus) === 'Error' ? 'Error' : '');
		setState({ initialPromptSent: success });
		isProcessing.set(false);
	}
}
