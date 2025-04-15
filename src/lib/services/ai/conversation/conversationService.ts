// src/lib/services/ai/conversation/conversationService.ts

import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
// Import the specific conversation store instance and its readable counterpart
import { conversationStore, conversationReadable } from './conversationStore';
// Import the main application store to access the central transaction list
import { appStore } from '$lib/stores/AppStore';
import { deepseekChat, getFallbackResponse, DeepSeekApiError } from '../deepseek-client';
import { getSystemPrompt, getSummaryPrompt } from '../prompts';
import { BULK_DATA_THRESHOLD_LENGTH } from './constants';
import { textLooksLikeTransaction, formatCurrency as formatCurrencyUtil } from '$lib/utils/helpers';
import { categorizeTransaction } from '../../categorizer';
// Import derived stores for reading specific conversation state pieces if needed elsewhere
import {
	conversationMessages,
	isProcessing,
	safeAddAssistantMessage // Use this helper for adding assistant messages
} from './conversationDerivedStores';
// Import handlers
import { handleMood } from './handlers/mood-handler';
import { handleDirectionClarification } from './handlers/handleDirectionClarification';
import { handleCountCorrection } from './handlers/count-correction-handler';
import { handleBulkDirectionCorrection } from './handlers/bulk-direction-handler';
import { handleFillDetails } from './handlers/handleFillDetails';
import { handleCorrection } from './handlers/correction-handler';
import { handleExtraction } from './handlers/handleExtraction';
import { handleNormalResponse } from './handlers/normal-response-handler';
import { handleBulkData } from './handlers/bulk-data-handler';
import { handleInitialData } from './handlers/initial-data-handler';
import { handleDuplicateConfirmation } from './handlers/handleDuplicateConfirmation';

import type { Transaction } from '$lib/stores/types';

const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

// --- Internal Helper Functions ---
// startProcessing, finishProcessing, handleProcessingError remain the same
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
		safeAddAssistantMessage(finalResponse);
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
			return `Can't connect to AI services (authentication issue). Please check your configuration.`;
		} else if (error.status === 429 || error.message.includes('rate limit')) {
			return `AI service rate limit reached. Please try again later.`;
		} else if (error.status === 500 || error.message.includes('service is experiencing issues')) {
			return `The AI service seems to be having technical difficulties. Please try again later.`;
		} else {
			return `An API error occurred (${error.status || 'network'}): ${error.message}. Please try again.`;
		}
	} else if (error instanceof Error) {
		return `An unexpected error occurred: ${error.message}. Please try again.`;
	} else {
		return `An unknown error occurred during processing. Please try again.`;
	}
}
// --- End Internal Helper Functions ---

// --- Main Service Function ---
export async function sendMessage(message: string): Promise<void> {
	message = message.trim();
	if (!message) return;

	if (get(isProcessing)) {
		safeAddAssistantMessage("I'm still working on the previous request. Please wait.");
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
			handleDuplicateConfirmation,
			handleMood,
			handleDirectionClarification,
			handleCountCorrection,
			handleBulkDirectionCorrection,
			handleFillDetails,
			handleCorrection,
			handleExtraction,
			handleInitialData
			// handleNormalResponse is the final fallback below
		];

		for (const handler of handlers) {
			// Always pass both arguments; handlers that don't need the second will ignore it
			const result = await handler(message, explicitDirectionIntent);

			if (result?.handled) {
				assistantResponse = result.response || '';
				handled = true;
				console.log(`[sendMessage] Handled by: ${handler.name}`);
				break;
			}
		}

		// --- Bulk Data Check ---
		if (
			!handled &&
			textLooksLikeTransaction(message) &&
			message.length >= BULK_DATA_THRESHOLD_LENGTH
		) {
			console.log('[sendMessage] Handling as potential bulk data...');
			const bulkDataResult = await handleBulkData(message, explicitDirectionIntent);
			if (bulkDataResult.handled) {
				delegatedToBackground = true;
				handled = true;
				assistantResponse = ''; // Background task handles messages
			}
		}

		// --- Final Fallback ---
		if (!handled && !delegatedToBackground) {
			console.warn(
				`[sendMessage] Message "${message.substring(0, 50)}..." was not handled by specific handlers. Using normal response.`
			);
			// *** CORRECTED CALL: Pass only message ***
			const normalResult = await handleNormalResponse(message);
			assistantResponse = normalResult.response ?? getFallbackResponse();
			handled = true;
		}
	} catch (error) {
		assistantResponse = handleProcessingError(error);
		handled = true;
		conversationStore._clearDuplicateConfirmation();
		conversationStore._setClarificationNeeded(false, []);
	} finally {
		console.log(
			`[sendMessage] Finally block. Delegated: ${delegatedToBackground}, Handled: ${handled}, Response: "${assistantResponse.substring(0, 50)}..."`
		);
		if (!delegatedToBackground) {
			finishProcessing(assistantResponse);
		} else {
			console.log(
				'[sendMessage] Delegated to background, skipping immediate finishProcessing call.'
			);
			conversationStore._setProcessing(true);
		}
	}
}

// --- Other Service Functions ---
// generateSummary, abortAndClear, initialize remain the same

export async function generateSummary(): Promise<void> {
	if (get(isProcessing)) {
		safeAddAssistantMessage('Please wait until the current processing is finished.');
		return;
	}
	const txns = get(appStore).transactions;
	if (txns.length === 0) {
		safeAddAssistantMessage("I haven't recorded any transactions yet to summarize.");
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
			console.warn('[generateSummary] AI returned empty summary, generating basic fallback.');
			const incomeTotal = txns
				.filter((t: Transaction) => t.direction === 'in')
				.reduce((sum: number, t: Transaction) => sum + (Number(t.amount) || 0), 0);
			const expenseTotal = txns
				.filter((t: Transaction) => t.direction === 'out')
				.reduce((sum: number, t: Transaction) => sum + (Number(t.amount) || 0), 0);
			summaryResponse = `Based on the ${txns.length} transaction(s): Total Income: ${formatCurrencyUtil(incomeTotal)}, Total Expenses: ${formatCurrencyUtil(expenseTotal)}.`;
		}
	} catch (error) {
		console.error('[generateSummary] LLM error:', error);
		conversationStore._updateStatus('Error generating summary');
		summaryResponse = 'Sorry, I encountered an error while trying to generate the summary.';
	} finally {
		finishProcessing(summaryResponse);
	}
}

export function abortAndClear(): void {
	conversationStore._clearBackgroundProcessing();
	conversationStore._clearDuplicateConfirmation();
	conversationStore._setClarificationNeeded(false, []);
	initialize();
	safeAddAssistantMessage('Okay, starting fresh. How can I help you?');
}

export function initialize(): void {
	conversationStore.reset();
	safeAddAssistantMessage(
		"Hello! I'm your AI Transaction Assistant. Paste your transaction data or describe your spending and I’ll help you organize it."
	);
	conversationStore._setInitialPromptSent(false);
}
