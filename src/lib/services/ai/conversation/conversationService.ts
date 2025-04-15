// src/lib/services/ai/conversation/conversationService.ts

import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { conversationStore, conversationReadable } from './conversationStore';
import { deepseekChat, getFallbackResponse, DeepSeekApiError } from '../deepseek-client';
import { getSystemPrompt, getSummaryPrompt } from '../prompts';
import { BULK_DATA_THRESHOLD_LENGTH } from './constants';
import { textLooksLikeTransaction, formatCurrency as formatCurrencyUtil } from '$lib/utils/helpers';
import { categorizeTransaction } from '../../categorizer';
import {
	conversationMessages,
	isProcessing,
	safeAddAssistantMessage
} from './conversationDerivedStores';
import { handleMood } from './handlers/mood-handler';
import { handleDirectionClarification } from './handlers/direction-clarification-handler';
import { handleCountCorrection } from './handlers/count-correction-handler';
import { handleBulkDirectionCorrection } from './handlers/bulk-direction-handler';
import { handleFillDetails } from './handlers/fill-details-handler';
import { handleCorrection } from './handlers/correction-handler';
import { handleExtraction } from './handlers/extraction-handler';
import { handleNormalResponse } from './handlers/normal-response-handler';
import { handleBulkData } from './handlers/bulk-data-handler';
import { handleInitialData } from './handlers/initial-data-handler';
import type { Transaction } from '$lib/stores/types';

const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

function startProcessing(message: string) {
	conversationStore._addMessage('user', message);
	conversationStore._updateStatus('Thinking...', 10);
}

function finishProcessing(assistantResponse: string) {
	const { initialPromptSent } = conversationStore._getInternalState();
	let finalResponse = assistantResponse?.trim() || '';

	if (!finalResponse) {
		console.warn('[finishProcessing] No assistant response to display.');
	}

	conversationStore._updateStatus('Finished', 100);

	if (finalResponse) {
		conversationStore._addMessage('assistant', finalResponse);
	}

	if (!initialPromptSent && textLooksLikeTransaction(finalResponse)) {
		conversationStore._setInitialPromptSent(true);
	}

	setTimeout(() => {
		conversationStore._setProcessing(false);
		const currentStatus = get(conversationReadable).status;
		conversationStore._updateStatus(currentStatus !== 'Error' ? '' : 'Error', 0);
	}, 300);
}

function handleProcessingError(error: unknown): string {
	console.error('[Processing error]:', error);
	conversationStore._updateStatus('Error');

	if (error instanceof DeepSeekApiError) {
		if (error.status === 401 || error.message.includes('Authentication')) {
			return `Can't connect to AI services (auth issue). Check your configuration.`;
		} else if (error.status === 429 || error.message.includes('rate limit')) {
			return `Rate limit reached. Try again later.`;
		} else if (error.status === 500 || error.message.includes('service is experiencing issues')) {
			return `AI service is currently having issues.`;
		} else {
			return `API error (${error.status || 'network'}): ${error.message}`;
		}
	} else if (error instanceof Error) {
		return `Unexpected error: ${error.message}`;
	} else {
		return `An unknown error occurred.`;
	}
}

export async function sendMessage(message: string): Promise<void> {
	message = message.trim();
	if (!message) return;

	const currentState = get(conversationReadable);
	if (currentState.isProcessing) {
		conversationStore._addMessage('assistant', `I'm still working on the previous request.`);
		return;
	}

	conversationStore._setProcessing(true);
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
				break;
			}
		}

		if (
			!handled &&
			message.length >= BULK_DATA_THRESHOLD_LENGTH &&
			textLooksLikeTransaction(message)
		) {
			const bulkDataResult = await handleBulkData(message, explicitDirectionIntent);
			if (bulkDataResult.handled) {
				conversationStore._addMessage(
					'assistant',
					"That's a lot of data! I'll process it in the background."
				);
				delegatedToBackground = true;
				handled = true;
			}
		}

		if (!handled) {
			const initialDataResult = await handleInitialData(message, explicitDirectionIntent);
			if (initialDataResult.handled) return;
		}
	} catch (error) {
		assistantResponse = handleProcessingError(error);
		handled = true;
	} finally {
		if (!delegatedToBackground) {
			finishProcessing(assistantResponse);
		} else {
			conversationStore._setProcessing(true);
		}
	}
}

export async function generateSummary(): Promise<void> {
	const currentState = get(conversationReadable);
	if (currentState.isProcessing) {
		conversationStore._addMessage(
			'assistant',
			'Please wait until the current processing is finished.'
		);
		return;
	}
	const txns = currentState.extractedTransactions;
	if (txns.length === 0) {
		conversationStore._addMessage('assistant', `No transactions to summarize.`);
		return;
	}

	conversationStore._setProcessing(true);
	conversationStore._updateStatus('Generating summary...', 50);

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
			summaryResponse = `I have ${txns.length} transactions. Total In: ${formatCurrencyUtil(income)}, Total Out: ${formatCurrencyUtil(expense)}.`;
		}
	} catch (error) {
		console.error('[generateSummary] LLM error:', error);
		conversationStore._updateStatus('Error generating summary');
		summaryResponse = 'There was an error generating your summary.';
	} finally {
		finishProcessing(summaryResponse);
	}
}

export function completeAndClear(): Transaction[] {
	const txns = get(conversationReadable).extractedTransactions;
	initialize();
	return txns;
}

export function abortAndClear(): void {
	conversationStore._clearBackgroundProcessing();
	initialize();
	conversationStore._addMessage('assistant', 'Okay, starting fresh. How can I help you?');
}

export function initialize(): void {
	conversationStore.reset();
	conversationStore._addMessage(
		'assistant',
		"Hello! I'm your AI Transaction Assistant. Paste your transaction data or describe your spending and I’ll help you organize it."
	);
	conversationStore._setInitialPromptSent(false);
}

export function initializeConversation(): void {
	conversationStore.reset();
	conversationStore._addMessage(
		'assistant',
		'Hello! How can I help you with your transactions today?'
	);
	conversationStore._setInitialPromptSent(true);
}

export async function sendUserMessage(message: string): Promise<void> {
	if (get(isProcessing)) {
		safeAddAssistantMessage('Please wait, still processing your previous request...');
		return;
	}

	conversationStore._setProcessing(true);
	conversationStore._updateStatus('Thinking...', 10);

	try {
		conversationStore._addMessage('user', message);
		safeAddAssistantMessage(`Got it, you said: "${message}"`);
	} catch (error) {
		console.error('[sendUserMessage] Error:', error);
		safeAddAssistantMessage('Oops, there was a problem. Please try again.');
	} finally {
		conversationStore._updateStatus('Finished', 100);
		setTimeout(() => {
			conversationStore._setProcessing(false);
			conversationStore._updateStatus('', 0);
		}, 200);
	}
}

export function getConversationData() {
	return get(conversationMessages);
}
