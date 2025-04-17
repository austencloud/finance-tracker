// src/lib/services/ai/conversation/conversationService.ts
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

// App‑wide store
import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/stores/types';

// LLM plumbing
import { llmChat } from '$lib/services/ai/llm-helpers';
import { OllamaApiError } from '$lib/services/ai/ollama-client';

// Prompt builders & helpers
import { getSystemPrompt, getSummaryPrompt } from '../prompts';
import { textLooksLikeTransaction, formatCurrency as formatCurrencyUtil } from '$lib/utils/helpers';

// Chat‑flow constants & handlers
import { BULK_DATA_THRESHOLD_LENGTH } from './constants';

import { handleMood } from './handlers/handleMood';
import { handleDirectionClarification } from './handlers/handleDirectionClarification';
import { handleCountCorrection } from './handlers/handleCountCorrection';
import { handleBulkDirectionCorrection } from './handlers/handleBulkDirectionCorrection';
import { handleFillDetails } from './handlers/handleFillDetails';
import { handleCorrection } from './handlers/handleCorrection';
import { handleInitialData } from './handlers/handleInitialData';
import { handleExtraction } from './handlers/handleExtraction';
import { handleNormalResponse } from './handlers/handleNormalResponse';

// ────────────────────────────────────────────────────────────────────────────
// Regex helpers (unchanged)
// ────────────────────────────────────────────────────────────────────────────
const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

// ────────────────────────────────────────────────────────────────────────────
// Processing helpers
// ────────────────────────────────────────────────────────────────────────────
function startProcessing(message: string): void {
	appStore.addConversationMessage('user', message);
	appStore.setConversationProcessing(true);
	appStore.setConversationStatus('Thinking…', 10);
}

function finishProcessing(assistantResponse: string | undefined): void {
	const finalResponse = assistantResponse?.trim();
	if (finalResponse && finalResponse.length > 0) {
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

	let message = "I'm having trouble processing that…";

	if (error instanceof OllamaApiError) {
		if (error.status === 408) {
			message = 'Local Ollama timed out. Is the server still running?';
		} else if (error.message.includes('not installed')) {
			message = error.message; // conveys “ollama pull …”
		} else {
			message = `Ollama error (${error.status ?? 'network'}): ${error.message}`;
		}
	} else if (error instanceof Error) {
		message = `Unexpected error: ${error.message}`;
	}

	return message;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────
export async function sendMessage(message: string): Promise<void> {
	message = message.trim();
	if (!message) return;

	if (get(appStore).conversation.isProcessing) {
		appStore.addConversationMessage(
			'assistant',
			"I'm still working on the previous request. Please wait."
		);
		return;
	}

	startProcessing(message);

	let explicitDirectionIntent: 'in' | 'out' | null = null;
	const lower = message.toLowerCase();
	if (BULK_DIRECTION_ALL_IN_REGEX.test(lower) && message.length < 50)
		explicitDirectionIntent = 'in';
	if (BULK_DIRECTION_ALL_OUT_REGEX.test(lower) && message.length < 50)
		explicitDirectionIntent = 'out';

	const handlers = [
		handleDirectionClarification,
		handleCountCorrection,
		handleBulkDirectionCorrection,
		handleFillDetails,
		handleCorrection,
		handleInitialData,
		handleExtraction,
		handleNormalResponse,
		handleMood
	];

	let assistantResponse = '';

	try {
		for (const h of handlers) {
			const res = await h(message, explicitDirectionIntent);
			if (res?.handled) {
				assistantResponse = res.response ?? '';
				console.log(`[sendMessage] Message handled by: ${h.name}`);
				break;
			}
		}
	} catch (err) {
		assistantResponse = handleProcessingError(err);
	} finally {
		finishProcessing(assistantResponse);
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Summary generator (unchanged except for Ollama‑only llmChat import)
// ────────────────────────────────────────────────────────────────────────────
export async function generateSummary(): Promise<void> {
	if (get(appStore).conversation.isProcessing) {
		appStore.addConversationMessage(
			'assistant',
			'Please wait until the current processing is finished.'
		);
		return;
	}

	const txns = get(appStore).transactions;
	if (!txns.length) {
		appStore.addConversationMessage('assistant', 'No transactions recorded yet to summarise.');
		return;
	}

	appStore.setConversationProcessing(true);
	appStore.setConversationStatus('Generating summary…', 50);

	let summaryResponse = '';
	const today = new Date().toISOString().split('T')[0];

	try {
		const promptContent = getSummaryPrompt(txns);
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: promptContent }
		];
		summaryResponse = await llmChat(messages, { temperature: 0.5, rawUserText: promptContent });

		if (!summaryResponse?.trim()) {
			const income = txns
				.filter((t) => t.direction === 'in')
				.reduce((s, t) => s + (t.amount || 0), 0);
			const expense = txns
				.filter((t) => t.direction === 'out')
				.reduce((s, t) => s + (t.amount || 0), 0);
			summaryResponse =
				`Summary based on ${txns.length} recorded transactions: ` +
				`Total Income: ${formatCurrencyUtil(income)}, ` +
				`Total Expenses: ${formatCurrencyUtil(expense)}.`;
		}
	} catch (err) {
		console.error('[generateSummary] LLM error:', err);
		appStore.setConversationStatus('Error generating summary');
		summaryResponse = 'There was an error generating the summary.';
	} finally {
		finishProcessing(summaryResponse);
	}
}

// ────────────────────────────────────────────────────────────────────────────
export function abortAndClear(): void {
	console.log('[abortAndClear] Clearing conversation and resetting state.');
	appStore.resetConversation();
	appStore.setConversationProcessing(false);
}

export function initialize(): void {
	console.log('[initialize] Resetting conversation state.');
	appStore.resetConversation();
}
