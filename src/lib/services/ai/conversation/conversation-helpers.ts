// src/lib/services/ai/conversation/helpers.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { deepseekChat, getFallbackResponse } from '../deepseek-client';
import { getSystemPrompt } from '../prompts';
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
} from '../store';

import { BULK_DATA_THRESHOLD_LINES, BULK_DATA_THRESHOLD_LENGTH } from './constants';
import { extractTransactionsFromText } from '../extraction/orchestrator';

/**
 * Safely adds an assistant message to the conversation, with locking to prevent race conditions
 */ // In conversation-helpers.ts

export function safeAddAssistantMessage(content: string): void {
	// Log attempt with lock status
	console.log(
		'[safeAddAssistantMessage] Attempting to add message:',
		content.substring(0, 50) + '...'
	);
	console.log('[safeAddAssistantMessage] Current lock status:', getState().messageInProgress);

	// Safety mechanism: forcibly reset lock if it's been held too long
	if (getState().messageInProgress) {
		const lockTime = getState().messageStartTime || Date.now();
		const lockDuration = Date.now() - lockTime;

		// If lock has been held more than 3 seconds, force reset
		if (lockDuration > 3000) {
			console.warn(`[safeAddAssistantMessage] Lock held for ${lockDuration}ms, force resetting`);
			setState({ messageInProgress: false, messageStartTime: 0 });
		}
	}

	// If still locked after reset check, defer message with setTimeout
	if (getState().messageInProgress) {
		console.warn(
			'[safeAddAssistantMessage] Message system locked, scheduling retry:',
			content.substring(0, 50) + '...'
		);

		// Try again after a short delay
		setTimeout(() => {
			safeAddAssistantMessage(content);
		}, 500);
		return;
	}

	// Lock the message system
	setState({ messageInProgress: true, messageStartTime: Date.now() });

	try {
		// Add the message
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content }]);
		console.log('[safeAddAssistantMessage] Successfully added message');
	} catch (error) {
		console.error('[safeAddAssistantMessage] Error adding message:', error);
	} finally {
		// Schedule lock release after a short delay to prevent rapid-fire messages
		setTimeout(() => {
			setState({ messageInProgress: false, messageStartTime: 0 });
			console.log('[safeAddAssistantMessage] Lock released');
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
	conversationProgress.set(10); // Small initial progress for user feedback
}

/**
 * Finalizes the processing state and adds the assistant response to the conversation
 */
export function finishProcessing(assistantResponse: string): void {
	const { initialPromptSent } = getState();

	if (!assistantResponse || !assistantResponse.trim()) {
		assistantResponse = getFallbackResponse();
	}

	conversationProgress.set(100);
	safeAddAssistantMessage(assistantResponse);

	// Update initialPromptSent if needed
	if (!initialPromptSent && textLooksLikeTransaction(assistantResponse)) {
		setState({ initialPromptSent: true });
	}

	isProcessing.set(false);

	// Reset progress after a short delay
	setTimeout(() => {
		conversationProgress.set(0);
		if (get(conversationStatus) !== 'Error') {
			conversationStatus.set('');
		}
	}, 500);
}

/**
 * Handles error scenarios during processing
 */
export function handleProcessingError(error: unknown): string {
	console.error('[sendUserMessage] Processing error:', error);
	conversationStatus.set('Error');

	if (error instanceof Error && error.message.includes('API key')) {
		return "I can't connect to my AI services due to an authentication issue. Please check your API configuration.";
	}

	if (error instanceof Error && error.message.includes('rate limit')) {
		return "I've reached my usage limit. Please try again in a moment.";
	}

	return "I'm having trouble processing that. Please try again in a moment or rephrase your message with simpler language.";
}

/**
 * Processes the very first message if it looks like transaction data.
 * Enhanced to handle multiple transactions and provide better feedback.
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

			// Check if any transactions are incomplete
			const incompleteTransactions = transactions.filter(
				(t) =>
					t.description === 'unknown' ||
					t.date === 'unknown' ||
					t.amount === 0 ||
					t.direction === 'unknown'
			);

			if (incompleteTransactions.length > 0) {
				// Get AI help to formulate questions about the incomplete data
				const clarPrompt = `
          The user provided transaction information, but ${incompleteTransactions.length} out of ${transactions.length} transactions have missing information. 
          Ask focused questions to get ONLY the missing details. Be specific about which transaction you're asking about.
        `;

				const visibleMsgs = get(conversationMessages);
				const clarMessages = [
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMsgs,
					{ role: 'system', content: clarPrompt }
				];

				assistantResponse = await deepseekChat(clarMessages);
			} else {
				// If all transactions are complete, generate a success message
				if (transactions.length === 1) {
					// Single complete transaction
					const { amount, description, date } = transactions[0];
					const amtNum =
						typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;
					const direction = transactions[0].direction === 'in' ? 'received' : 'spent';

					assistantResponse = `Got it! I've recorded $${amtNum.toFixed(2)} ${direction} ${
						description !== 'unknown' ? `for "${description}" ` : ''
					}on ${formatDateForDisplay(date)}. Anything else you'd like to add?`;
				} else {
					// Multiple complete transactions
					assistantResponse = `Great! I've recorded ${transactions.length} transactions:\n\n`;

					transactions.forEach((txn, index) => {
						const amtNum =
							typeof txn.amount === 'string'
								? parseFloat(txn.amount.replace(/[$,]/g, ''))
								: txn.amount;
						const direction = txn.direction === 'in' ? 'received' : 'spent';

						assistantResponse += `${index + 1}. $${amtNum.toFixed(2)} ${direction} ${
							txn.description !== 'unknown' ? `for "${txn.description}" ` : ''
						}on ${formatDateForDisplay(txn.date)}\n`;
					});

					assistantResponse += '\nWould you like to add more transactions?';
				}
			}

			success = true;
		} else {
			assistantResponse =
				"I couldn't identify any clear transaction details in your message. Could you try again with more specific information about amounts, dates, and what each transaction was for?";
			success = false;
		}

		safeAddAssistantMessage(assistantResponse);
	} catch (err) {
		console.error('[processInitialData] Error:', err);
		safeAddAssistantMessage(
			'I encountered an error while processing your transaction data. Could you try again with a simpler description?'
		);
		conversationStatus.set('Error');
		success = false;
	} finally {
		conversationProgress.set(100);
		setTimeout(() => {
			conversationProgress.set(0);
			conversationStatus.set(get(conversationStatus) === 'Error' ? 'Error' : '');
		}, 800);

		setState({ initialPromptSent: success });
		isProcessing.set(false);
	}
}
