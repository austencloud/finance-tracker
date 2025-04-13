// src/lib/services/ai/conversation.ts (MODIFIED)
// --------------------------------------
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { ollamaChat } from './llm-client';
import { getSystemPrompt, getSummaryPrompt } from './prompts';
import { extractTransactionsFromText } from './extraction';
import { textLooksLikeTransaction } from '$lib/utils/helpers';

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
} from './store'; // <-- CHANGE HERE

// Import handler modules


import {
	isBulkData,
	startProcessing,
	finishProcessing,
	handleProcessingError,
	formatDateForDisplay,
	safeAddAssistantMessage,
	processInitialData
} from './conversation/helpers';
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

// --- Main Message Handler ---
export async function sendUserMessage(message: string): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[sendUserMessage] Already processing. Ignored:', message);
		return;
	}

	startProcessing(message);
	let assistantResponse = '';

	try {
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
		// 5. Try to extract a new transaction
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
 * Generates a summary message based on currently extracted transactions.
 */
export async function generateSummary(): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[generateSummary] Already processing, ignoring...');
		return;
	}

	const txns = get(extractedTransactions);
	if (txns.length === 0) {
		safeAddAssistantMessage("I haven't recorded any transactions yet...");
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

		summaryResponse = await ollamaChat(summaryMsgs);

		if (!summaryResponse || !summaryResponse.trim()) {
			summaryResponse = `Okay, I have ${txns.length} transaction(s) recorded...`;
		}
	} catch (err) {
		console.error('[generateSummary] LLM error:', err);
		summaryResponse = `Sorry, I encountered an error generating the summary...`;
		conversationStatus.set('Error');
	} finally {
		safeAddAssistantMessage(summaryResponse);
		conversationStatus.set(get(conversationStatus) === 'Error' ? 'Error' : '');
		isProcessing.set(false);
	}
}


export {
	safeAddAssistantMessage,
	formatDateForDisplay,
	isBulkData,
	processInitialData,
	setState,
	getState
};
