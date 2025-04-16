import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/stores/types';

import { deepseekChat, getFallbackResponse, DeepSeekApiError } from '../deepseek-client';
import { getSystemPrompt, getSummaryPrompt } from '../prompts';
import { BULK_DATA_THRESHOLD_LENGTH } from './constants';
import { textLooksLikeTransaction, formatCurrency as formatCurrencyUtil } from '$lib/utils/helpers';

import { handleMood } from './handlers/handleMood';
import { handleCountCorrection } from './handlers/handleCountCorrection';
import { handleBulkDirectionCorrection } from './handlers/handleBulkDirectionCorrection';
import { handleCorrection } from './handlers/handleCorrection';
import { handleNormalResponse } from './handlers/handleNormalResponse';
import { handleBulkData } from './handlers/handleBulkData';
import { handleInitialData } from './handlers/handleInitialData';
import { handleDirectionClarification } from './handlers/handleDirectionClarification';
import { handleFillDetails } from './handlers/handleFillDetails';
import { handleExtraction } from './handlers/handleExtraction';

const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

function startProcessing(message: string): void {
	appStore.addConversationMessage('user', message);
	appStore.setConversationProcessing(true);
	appStore.setConversationStatus('Thinking...', 10);
}

function finishProcessing(assistantResponse: string): void {
	const state = get(appStore);
	let finalResponse = assistantResponse?.trim() || '';

	if (!finalResponse) {
		console.warn('[finishProcessing] No assistant response content.');
	} else {
		appStore.addConversationMessage('assistant', finalResponse);
	}

	appStore.setConversationStatus('Finished', 100);
	setTimeout(() => {
		appStore.setConversationProcessing(false);

		if (get(appStore).conversation.status === 'Finished') {
			appStore.setConversationStatus('', 0);
		}
	}, 300);
}

function handleProcessingError(error: unknown): string {
	console.error('[Processing error]:', error);

	appStore.setConversationStatus('Error');

	let message = "I'm having trouble processing that...";
	if (error instanceof DeepSeekApiError) {
		if (error.status === 401 || error.message.includes('Authentication')) {
			message = "Can't connect to AI services (auth issue). Check your configuration.";
		} else if (error.status === 429 || error.message.includes('rate limit')) {
			message = `Rate limit reached. Try again later.`;
		} else if (error.status === 500 || error.message.includes('service is experiencing issues')) {
			message = `AI service is currently having issues.`;
		} else {
			message = `API error (${error.status || 'network'}): ${error.message}`;
		}
	} else if (error instanceof Error) {
		message = `Unexpected error: ${error.message}`;
	} else {
		message = `An unknown error occurred.`;
	}
	return message;
}

export async function sendMessage(message: string): Promise<void> {
	message = message.trim();
	if (!message) return;

	if (get(appStore).conversation.isProcessing) {
		appStore.addConversationMessage('assistant', `I'm still working on the previous request.`);
		return;
	}

	startProcessing(message);

	let explicitDirectionIntent: 'in' | 'out' | null = null;
	const lowerMessage = message.toLowerCase();
	if (BULK_DIRECTION_ALL_IN_REGEX.test(lowerMessage) && message.length < 50) {
		explicitDirectionIntent = 'in';
	} else if (BULK_DIRECTION_ALL_OUT_REGEX.test(lowerMessage) && message.length < 50) {
		explicitDirectionIntent = 'out';
	}

	let handled = false;
	let assistantResponse = '';
	let delegatedToBackground = false;

	try {
		const handlers = [
			handleMood,
			handleDirectionClarification,
			handleCountCorrection,
			handleBulkDirectionCorrection,
			handleFillDetails,
			handleCorrection,
			handleExtraction,
			handleNormalResponse
		];

		for (const handler of handlers) {
			const result = await handler(message, explicitDirectionIntent);
			if (result?.handled) {
				assistantResponse = result.response || '';
				handled = true;

				if (result.response === undefined) assistantResponse = '';
				break;
			}
		}

		// Handle initial data (assuming handleInitialData uses appStore internally now)
		if (!handled) {
			const initialDataResult = await handleInitialData(message, explicitDirectionIntent);
			// Initial data handler might manage its own finishProcessing call
			// Or return response here if sendMessage should handle it.
			if (initialDataResult.handled) {
				// Line 151 (approx)
				// If initialDataResult handles its own messages/finishProcessing, just return
				// return;
				// If it returns a response to be shown:
				// assistantResponse = initialDataResult.response || ''; // <-- Error likely occurs here (line 153 approx)
				// handled = true;
				return; // Assuming initialData handles its own completion cycle
			}
		}
		if (!handled) {
			const initialDataResult = await handleInitialData(message, explicitDirectionIntent);

			if (initialDataResult.handled) {
				return;
			}
		}

		if (!handled && !delegatedToBackground) {
			console.warn(`[sendMessage] Message fell through all handlers: "${message}"`);

			const normalResult = await handleNormalResponse(message);
			assistantResponse = normalResult.response ?? "Sorry, I'm not sure how to handle that.";

			handled = true;
		}
	} catch (error) {
		assistantResponse = handleProcessingError(error);
		handled = true;
	} finally {
		if (!delegatedToBackground) {
			finishProcessing(assistantResponse);
		} else {
			console.log('[sendMessage] Delegated to background processing.');

			if (!get(appStore).conversation.isProcessing) {
				appStore.setConversationProcessing(true);
			}
		}
	}
}

export async function generateSummary(): Promise<void> {
	if (get(appStore).conversation.isProcessing) {
		appStore.addConversationMessage(
			'assistant',
			'Please wait until the current processing is finished.'
		);
		return;
	}

	const txns = get(appStore).transactions;
	if (txns.length === 0) {
		appStore.addConversationMessage('assistant', `No transactions recorded yet to summarize.`);
		return;
	}

	appStore.setConversationProcessing(true);
	appStore.setConversationStatus('Generating summary...', 50);

	let summaryResponse = '';
	const today = new Date().toISOString().split('T')[0];

	try {
		const promptContent = getSummaryPrompt(txns);
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: promptContent }
		];
		summaryResponse = await deepseekChat(messages, { temperature: 0.5 });

		if (!summaryResponse?.trim()) {
			const income = txns
				.filter((t) => t.direction === 'in')
				.reduce((sum, t) => sum + (t.amount || 0), 0);
			const expense = txns
				.filter((t) => t.direction === 'out')
				.reduce((sum, t) => sum + (t.amount || 0), 0);
			summaryResponse = `Summary based on ${txns.length} recorded transactions: Total Income: ${formatCurrencyUtil(income)}, Total Expenses: ${formatCurrencyUtil(expense)}.`;
		}
	} catch (error) {
		console.error('[generateSummary] LLM error:', error);
		appStore.setConversationStatus('Error generating summary');
		summaryResponse = 'There was an error generating the summary.';
	} finally {
		finishProcessing(summaryResponse);
	}
}

export function abortAndClear(): void {
	appStore.resetConversation();
}

export function initialize(): void {
	appStore.resetConversation();
}
