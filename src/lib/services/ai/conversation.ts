// src/lib/services/ai/conversation.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { deepseekChat, getFallbackResponse } from './deepseek-client';
import { getSystemPrompt, getSummaryPrompt } from './prompts';

// Import stores
import {
	conversationMessages,
	conversationStatus,
	isProcessing,
	conversationProgress,
	extractedTransactions,
	userMood,
	getState,
	setState
} from './store';

// Import handler modules
import {
	isBulkData,
	startProcessing,
	finishProcessing,
	handleProcessingError,
	formatDateForDisplay,
	safeAddAssistantMessage,
	processInitialData
} from './conversation/conversation-helpers';
import { handleCorrection } from './conversation/correction-handler';
import { extractNewTransaction } from './conversation/extraction-handler';
import { getNormalResponse } from './conversation/normal-response-handler';
import { fillMissingDetails } from './conversation/fill-details-handler';
import { processBulkData } from './conversation/bulk-data-handler';
import { handleInitialData } from './conversation/initial-data-handler';
import { handleUserMood } from './conversation/mood-handler';

// Export stores for external use
export {
	conversationMessages,
	conversationStatus,
	isProcessing,
	conversationProgress,
	extractedTransactions,
	userMood
};

// --- Initialization and Reset ---
export function initializeConversation(): void {
	resetConversationState();
	conversationMessages.set([
		{
			role: 'assistant',
			content:
				"Hello! I'm your AI Transaction Assistant. Paste your transaction data, type it out, or describe your spending, and I'll help you organize it. How can I help you get started?"
		}
	]);
}

export function resetConversationState(): void {
	conversationMessages.set([]);
	conversationProgress.set(0);
	conversationStatus.set('');
	extractedTransactions.set([]);
	isProcessing.set(false);
	userMood.set('unknown');
	setState({ initialPromptSent: false, messageInProgress: false });
}

// --- Conversation Actions ---
export function completeConversation(): Transaction[] {
	const txns = get(extractedTransactions);
	resetConversationState();
	return txns;
}

export function abortConversation(): void {
	resetConversationState();
}

// Add this import to the top of your file:
import { startBackgroundProcessing } from './conversation/bulk-data-handler';

/**
 * Improved main message handler that delegates large bank statements to background processing
 */
export async function sendUserMessage(message: string): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[sendUserMessage] Already processing. Ignored:', message);
		return;
	}

	if (!message || message.trim().length === 0) {
		console.warn('[sendUserMessage] Empty message. Ignored.');
		return;
	}

	// Start processing
	startProcessing(message);
	let assistantResponse = '';

	try {
		// FAST PATH: Check if this is a large bank statement and process in background
		// This makes the UI feel much more responsive
		if (isBankStatement(message) && message.length > 1000) {
			const result = startBackgroundProcessing(message);
			if (result.handled) {
				assistantResponse = result.response;
				finishProcessing(assistantResponse);
				return;
			}
		}

		// NORMAL PATH: Continue with standard processing for non-bank statements
		// 1. Check for mood indicators
		const moodResult = handleUserMood(message);
		if (moodResult.handled) {
			safeAddAssistantMessage(moodResult.response);
			isProcessing.set(false);
			conversationStatus.set('');
			return;
		}

		// 2. Handle initial data if this is the first transaction message
		const initialDataResult = await handleInitialData(message);
		if (initialDataResult.handled) return;

		// 3. Process bulk data if detected
		const bulkDataResult = await processBulkData(message);
		if (bulkDataResult.handled) {
			safeAddAssistantMessage(bulkDataResult.response);
			isProcessing.set(false);
			conversationStatus.set('');
			return;
		}

		// 4. Try to fill in missing details for an existing transaction
		const detailsResult = fillMissingDetails(message);
		if (detailsResult.handled) {
			assistantResponse = detailsResult.response;
		}
		// 5. Try to extract transactions
		else {
			const extractionResult = await extractNewTransaction(message);
			if (extractionResult.handled) {
				assistantResponse = extractionResult.response;
			}
			// 6. Fall back to normal LLM conversation
			else {
				assistantResponse = await getNormalResponse(message);
			}
		}

		// 7. Check if the AI response suggests a correction
		const correctionResult = await handleCorrection(assistantResponse);
		if (correctionResult.applied) {
			assistantResponse = correctionResult.updatedResponse;
		}
	} catch (error) {
		assistantResponse = handleProcessingError(error);
	} finally {
		finishProcessing(assistantResponse);
	}
}

/**
 * Checks if a message appears to be a bank statement
 */
function isBankStatement(message: string): boolean {
	// Check for common bank statement format indicators
	const hasDates =
		/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/i.test(
			message
		);
	const hasDollarAmounts = /\$\s*[\d,]+\.\d{2}/i.test(message);
	const hasBankingTerms =
		/\b(transfer|deposit|credit|debit|withdrawal|payment|ppd|id:|card)\b/i.test(message);

	// Must have dates, dollar amounts, and banking terms
	return hasDates && hasDollarAmounts && hasBankingTerms;
}

/**
 * Generates a summary message based on currently extracted transactions.
 * Enhanced with improved error handling.
 */
export async function generateSummary(): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[generateSummary] Already processing, ignoring...');
		return;
	}

	const txns = get(extractedTransactions);
	if (txns.length === 0) {
		safeAddAssistantMessage(
			"I haven't recorded any transactions yet. Please share some transaction details with me first."
		);
		return;
	}

	conversationStatus.set('Generating summary...');
	isProcessing.set(true);
	let summaryResponse = '';
	const today = new Date().toISOString().split('T')[0];

	try {
		const promptContent = getSummaryPrompt(txns);
		const summaryMsgs = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: promptContent }
		];

		// Try to get a response with retries
		let retries = 2;
		let error = null;

		while (retries >= 0 && !summaryResponse) {
			try {
				summaryResponse = await deepseekChat(summaryMsgs);
				break;
			} catch (err) {
				error = err;
				retries--;
				console.log(`[generateSummary] Error, retries left: ${retries}`, err);
				// Wait before retrying
				if (retries >= 0) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		}

		// If we still have no response after retries, create a fallback
		if (!summaryResponse && error) {
			console.error('[generateSummary] Failed after retries:', error);

			// Create a simple fallback summary
			summaryResponse = `Here's a summary of your ${txns.length} transactions:\n\n`;

			// Group by category
			const categorySums: Record<string, number> = {};
			txns.forEach((txn) => {
				const category = txn.category;
				const amount =
					typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/[$,]/g, '')) : txn.amount;

				if (!categorySums[category]) categorySums[category] = 0;
				categorySums[category] += amount;
			});

			// Add category totals
			Object.entries(categorySums).forEach(([category, total]) => {
				summaryResponse += `${category}: $${total.toFixed(2)}\n`;
			});

			summaryResponse +=
				"\nI'm having some issues generating a detailed analysis. Would you like to add these transactions to your main list?";
		}

		if (!summaryResponse || !summaryResponse.trim()) {
			summaryResponse = `I have recorded ${txns.length} transaction(s). Would you like to add them to your main list or make any changes?`;
		}
	} catch (err) {
		console.error('[generateSummary] LLM error:', err);
		summaryResponse = `I have ${txns.length} transaction(s) recorded. Would you like to add them to your main list?`;
		conversationStatus.set('Error');
	} finally {
		safeAddAssistantMessage(summaryResponse);
		conversationStatus.set(get(conversationStatus) === 'Error' ? 'Error' : '');
		isProcessing.set(false);
	}
}

// Export helper functions
export {
	safeAddAssistantMessage,
	formatDateForDisplay,
	isBulkData,
	processInitialData,
	setState,
	getState
};
