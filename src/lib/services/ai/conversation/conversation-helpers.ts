// src/lib/services/ai/conversation/conversation-helpers.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { deepseekChat, getFallbackResponse } from '../deepseek-client';
import { getSystemPrompt } from '../prompts';
import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import { formatCurrency } from '$lib/utils/currency'; // Import formatCurrency
import {
	conversationMessages,
	conversationStatus,
	isProcessing,
	conversationProgress,
	extractedTransactions,
	getState, // Keep getState
	setState // Keep setState
} from '../store';

import { BULK_DATA_THRESHOLD_LINES, BULK_DATA_THRESHOLD_LENGTH } from './constants';
import { extractTransactionsFromText } from '../extraction/orchestrator';

/**
 * Safely adds an assistant message to the conversation, preventing overlap.
 */
export function safeAddAssistantMessage(content: string): void {
	// Log attempt
	console.log(
		'[safeAddAssistantMessage] Attempting to add message:',
		content.substring(0, 50) + '...'
	);

	// --- Simplified Lock Handling ---
	// If locked, simply log a warning and DO NOT add the message or retry.
	// The state likely changed, making the message potentially irrelevant.
	if (getState().messageInProgress) {
		console.warn(
			'[safeAddAssistantMessage] Message system locked, dropping message:', // Changed log
			content.substring(0, 50) + '...'
		);
		// *** REMOVED setTimeout retry ***
		return; // Exit without adding or retrying
	}

	// Lock the message system
	setState({ messageInProgress: true, messageStartTime: Date.now() });

	try {
		// Add the message
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content }]);
		// console.log('[safeAddAssistantMessage] Successfully added message'); // Less noisy log
	} catch (error) {
		console.error('[safeAddAssistantMessage] Error adding message:', error);
	} finally {
		// Release the lock immediately after update (Svelte updates are sync)
		setState({ messageInProgress: false, messageStartTime: 0 });
		// console.log('[safeAddAssistantMessage] Lock released'); // Less noisy log
	}
}

/**
 * Formats a date string for display in a human-readable format
 */
export function formatDateForDisplay(dateStr: string): string {
	if (!dateStr || dateStr === 'unknown') return 'an unknown date';

	try {
		// Use chrono-node via resolveAndFormatDate first for better parsing
		const resolvedDate = resolveAndFormatDate(dateStr); // This returns YYYY-MM-DD or original/unknown
		if (resolvedDate !== 'unknown' && /\d{4}-\d{2}-\d{2}/.test(resolvedDate)) {
			// Add time T00:00:00 to avoid timezone issues when creating Date object
			const d = new Date(resolvedDate + 'T00:00:00');
			if (!isNaN(d.getTime())) {
				return d.toLocaleDateString('en-US', {
					weekday: 'long',
					year: 'numeric',
					month: 'long',
					day: 'numeric',
					timeZone: 'UTC' // Specify UTC to match the T00:00:00
				});
			}
		}
		// Fallback for original formats if resolve failed but Date() can parse it
		const d = new Date(dateStr);
		if (!isNaN(d.getTime())) {
			return d.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		}

		return dateStr; // Return original if all parsing fails
	} catch (e) {
		console.warn(`[formatDateForDisplay] Error parsing date "${dateStr}":`, e);
		return dateStr; // Return original on error
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
 * Sets initial processing state and adds the user message to the conversation
 */
export function startProcessing(message: string): void {
	// Only add user message if it's not already the last message
	const currentMessages = get(conversationMessages);
	if (
		currentMessages.length === 0 ||
		currentMessages[currentMessages.length - 1].role !== 'user' ||
		currentMessages[currentMessages.length - 1].content !== message
	) {
		conversationMessages.update((msgs) => [...msgs, { role: 'user', content: message }]);
	}
	conversationStatus.set('Thinking...');
	// isProcessing is now set at the start of sendUserMessage
	// isProcessing.set(true);
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

	conversationProgress.set(100); // Show completion before adding message
	safeAddAssistantMessage(assistantResponse);

	// Update initialPromptSent if needed and if response looks like a transaction confirmation
	if (!initialPromptSent && textLooksLikeTransaction(assistantResponse)) {
		setState({ initialPromptSent: true });
	}

	// Reset progress after a short delay for visual completion
	setTimeout(() => {
		conversationProgress.set(0);
		// Only reset status if it wasn't set to Error during processing
		if (get(conversationStatus) !== 'Error') {
			conversationStatus.set('');
		}
	}, 500);

	// Reset isProcessing flag *here* as this marks the end of a processing cycle
	// unless a background task is running.
	isProcessing.set(false);
	console.log('[finishProcessing] Set isProcessing to false.');
}

/**
 * Handles error scenarios during processing
 */
export function handleProcessingError(error: unknown): string {
	console.error('[handleProcessingError] Processing error:', error);
	conversationStatus.set('Error'); // Set status to Error

	let message =
		"I'm having trouble processing that. Please try again in a moment or rephrase your message with simpler language."; // Default

	if (error instanceof Error) {
		if (error.message.includes('API key') || error.message.includes('Authentication failed')) {
			message =
				"I can't connect to my AI services due to an authentication issue. Please check your API configuration.";
		} else if (error.message.includes('rate limit')) {
			message = "I've reached my usage limit. Please try again in a moment.";
		} else if (error.message.includes('service is experiencing issues')) {
			message = 'The AI service seems to be experiencing issues. Please try again later.';
		} else {
			// Include generic error message for other cases
			message = `Sorry, an error occurred: ${error.message}. Please try again.`;
		}
	}

	// Ensure isProcessing is reset on error
	isProcessing.set(false);
	console.log('[handleProcessingError] Set isProcessing to false due to error.');
	return message;
}

/**
 * Processes the very first message if it looks like transaction data.
 * Returns true if handled, false otherwise.
 */
export async function processInitialData(text: string): Promise<{ handled: boolean }> {
	conversationProgress.set(20);
	conversationStatus.set('Analyzing initial data...');
	let assistantResponse = ''; // Use assistantResponse consistently
	let success = false;
	let handledState = false; // Track if this function handles the message
	const today = new Date().toISOString().split('T')[0];

	try {
		const transactions = await extractTransactionsFromText(text);
		const extractedCount = transactions.length;

		if (extractedCount > 0) {
			handledState = true; // We are handling this message
			extractedTransactions.update((txns) => [...txns, ...transactions]);
			conversationProgress.set(80);

			const unknownDirectionTxns = transactions.filter((t) => t.direction === 'unknown');

			if (unknownDirectionTxns.length > 0) {
				// Generate clarification question
				let clarificationQuestion = `Okay, I recorded ${extractedCount} transaction(s). For ${unknownDirectionTxns.length === 1 ? 'one' : 'some'} of these, could you tell me if the money was coming IN or going OUT?\n`;
				unknownDirectionTxns.slice(0, 3).forEach((t) => {
					// Access transaction ID correctly (assuming it exists on type Transaction)
					clarificationQuestion += `- ${t.date} / ${t.description} / ${formatCurrency(t.amount)}\n`;
				});
				if (unknownDirectionTxns.length > 3) {
					clarificationQuestion += `- ...and ${unknownDirectionTxns.length - 3} more.\n`;
				}
				clarificationQuestion += `\nYou can say something like "the first was IN, the rest were OUT".`;

				// Use setState to update the state correctly
				setState({
					waitingForDirectionClarification: true,
					clarificationTxnIds: unknownDirectionTxns.map((t) => t.id)
				});
				assistantResponse = clarificationQuestion;
			} else {
				// All transactions have known directions, generate standard confirmation
				if (extractedCount === 1) {
					const txn = transactions[0];
					const amtNum =
						typeof txn.amount === 'string'
							? parseFloat(txn.amount.replace(/[$,]/g, ''))
							: txn.amount;
					const directionDisplay = txn.direction === 'in' ? 'received' : 'spent';
					assistantResponse = `Got it! I've recorded ${formatCurrency(amtNum)} ${directionDisplay} ${txn.description !== 'unknown' ? `for "${txn.description}" ` : ''}${txn.date !== 'unknown' ? `on ${formatDateForDisplay(txn.date)}` : ''}. Anything else you'd like to add?`;
				} else {
					assistantResponse = `Great! I've recorded ${extractedCount} transactions:\n\n`;
					const maxToList = 5;
					transactions.slice(0, maxToList).forEach((txn, index) => {
						const amtNum =
							typeof txn.amount === 'string'
								? parseFloat(txn.amount.replace(/[$,]/g, ''))
								: txn.amount;
						const directionDisplay = txn.direction === 'in' ? 'received' : 'spent';
						assistantResponse += `${index + 1}. ${formatCurrency(amtNum)} ${directionDisplay} ${txn.description !== 'unknown' ? `for "${txn.description}" ` : ''}${txn.date !== 'unknown' ? `on ${formatDateForDisplay(txn.date)}` : ''}\n`;
					});
					if (extractedCount > maxToList) {
						assistantResponse += `...and ${extractedCount - maxToList} more.\n`;
					}
					assistantResponse += '\nWould you like to add more transactions?';
				}
			}
			success = true; // Mark as successful extraction
		} else {
			// Extraction failed, but text looked like transaction initially.
			// Let sendUserMessage fall back to getNormalResponse.
			handledState = false; // Don't handle it here, let normal response try
			console.log('[processInitialData] Text looked like transaction, but no details extracted.');
		}
	} catch (err) {
		// Handle errors during extraction
		handledState = true; // We attempted to handle it but failed
		console.error('[processInitialData] Error:', err);
		assistantResponse = handleProcessingError(err); // Use error handler
		success = false;
	} finally {
		// Only finish processing if this handler actually handled the message
		if (handledState) {
			setState({ initialPromptSent: success });
			finishProcessing(assistantResponse); // Calls safeAddAssistantMessage and resets state
		} else {
			// If not handled, reset progress/status set at the start of this function
			// so the next handler starts fresh. isProcessing is reset by sendUserMessage.
			conversationProgress.set(0);
			conversationStatus.set('');
		}
	}
	return { handled: handledState }; // Return whether it was handled
}
