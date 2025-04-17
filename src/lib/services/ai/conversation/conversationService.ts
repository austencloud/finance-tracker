// src/lib/services/ai/conversation/conversationService.ts
import { get } from 'svelte/store'; // Re-import get for reading store values in service
import { v4 as uuidv4 } from 'uuid';

// --- Import Separated Stores ---
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
// Note: Individual handlers might need imports for other stores (e.g., appStore for split bill context)
// but the service itself primarily interacts with conversation and transaction stores here.

// --- Import Types ---
import type { Transaction } from '$lib/types/types'; // Adjust path if needed

// --- LLM/Helper Imports ---
import { llmChat } from '$lib/services/ai/llm-helpers'; // Adjust path if needed
import { OllamaApiError } from '$lib/services/ai/ollama-client'; // Adjust path if needed
import { getSystemPrompt, getSummaryPrompt } from '../prompts'; // Adjust path if needed
import { formatCurrency as formatCurrencyUtil } from '$lib/utils/helpers'; // Adjust path if needed

// --- Handler Imports ---
import { handleMood } from './handlers/handleMood';
import { handleDirectionClarification } from './handlers/handleDirectionClarification';
import { handleSplitBillShareResponse } from './handlers/handleSplitBillShareResponse';
import { handleCountCorrection } from './handlers/handleCountCorrection';
import { handleBulkDirectionCorrection } from './handlers/handleBulkDirectionCorrection';
import { handleFillDetails } from './handlers/handleFillDetails';
import { handleCorrection } from './handlers/handleCorrection';
import { handleExtraction } from './handlers/handleExtraction';
import { handleNormalResponse } from './handlers/handleNormalResponse';
// Removed textLooksLikeTransaction and BULK_DATA_THRESHOLD_LENGTH imports as they aren't directly used in *this* file's logic anymore

// ────────────────────────────────────────────────────────────────────────────
// Regex helpers (Keep as is)
// ────────────────────────────────────────────────────────────────────────────
const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX =
	/\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

// ────────────────────────────────────────────────────────────────────────────
// Processing helpers (Updated to use conversationStore)
// ────────────────────────────────────────────────────────────────────────────
function startProcessing(message: string): void {
	// Call actions on the specific store
	conversationStore.addMessage('user', message);
	conversationStore.setProcessing(true);
	conversationStore.setStatus('Thinking…', 10);
}

function finishProcessing(assistantResponse: string | undefined): void {
	const finalResponse = assistantResponse?.trim();
	if (finalResponse && finalResponse.length > 0) {
		// Call action on the specific store
		conversationStore.addMessage('assistant', finalResponse);
	}

	// Call action on the specific store
	conversationStore.setStatus('Finished', 100);

	// Debounce setting processing to false
	setTimeout(() => {
		// Read state via get() from the specific store
		if (get(conversationStore).status === 'Finished') {
			conversationStore.setStatus('', 0); // Clear status only if it was 'Finished'
		}
		conversationStore.setProcessing(false); // Always set processing false after timeout
	}, 300);
}

function handleProcessingError(error: unknown): string {
	console.error('[Processing error]:', error);
	// Call action on the specific store
	conversationStore.setStatus('Error');

	let message = "I'm having trouble processing that…";

	// Error handling logic remains the same
	if (error instanceof OllamaApiError) {
		if (error.status === 408) {
			message = 'Local Ollama timed out. Is the server still running?';
		} else if (error.message.includes('not installed')) {
			message = error.message; // conveys “ollama pull …”
		} else {
			message = `Ollama error (${error.status ?? 'network'}): ${error.message}`;
		}
	} else if (error && typeof error === 'object' && 'message' in error) {
		message = `Unexpected error: ${(error as Error).message}`;
	}

	return message;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────
export async function sendMessage(message: string): Promise<void> {
	message = message.trim();
	if (!message) return;

	// Read state via get() from the specific store
	if (get(conversationStore).isProcessing) {
		conversationStore.addMessage(
			'assistant',
			"I'm still working on the previous request. Please wait."
		);
		return;
	}

	startProcessing(message); // Uses updated helper

	// Explicit direction intent logic remains the same
	let explicitDirectionIntent: 'in' | 'out' | null = null;
	const lower = message.toLowerCase();
	if (BULK_DIRECTION_ALL_IN_REGEX.test(lower) && message.length < 50)
		explicitDirectionIntent = 'in';
	if (BULK_DIRECTION_ALL_OUT_REGEX.test(lower) && message.length < 50)
		explicitDirectionIntent = 'out';

	// Handler array includes the new split bill response handler
	const handlers = [
		handleDirectionClarification,
		handleSplitBillShareResponse, // Ensure this is imported
		handleCountCorrection,
		handleBulkDirectionCorrection,
		handleFillDetails,
		handleCorrection,
		handleExtraction,
		handleNormalResponse,
		handleMood
	];

	let assistantResponse = '';

	try {
		// Handler loop remains the same
		for (const h of handlers) {
			// Pass context needed by handlers (handlers now import stores themselves)
			const res = await h(message, explicitDirectionIntent);
			if (res?.handled) {
				assistantResponse = res.response ?? '';
				console.log(`[sendMessage] Message handled by: ${h.name}`);
				break; // Stop on first handled result
			}
		}
		// If no handler claimed it, handleProcessingError won't be called,
		// finishProcessing will just potentially add an empty assistant message.
		// This might be desired, or you could add a default "I didn't understand" response here.
		if (
			!assistantResponse &&
			!handlers.some(async (h) => (await h(message, explicitDirectionIntent))?.handled)
		) {
			console.log('[sendMessage] No handler processed the message.');
			// Optionally set a default response if nothing was handled
			// assistantResponse = "Sorry, I'm not sure how to handle that.";
		}
	} catch (err) {
		assistantResponse = handleProcessingError(err); // Uses updated helper
	} finally {
		finishProcessing(assistantResponse); // Uses updated helper
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Summary generator (Updated to use separated stores)
// ────────────────────────────────────────────────────────────────────────────
export async function generateSummary(): Promise<void> {
	// Read state via get() from the specific store
	if (get(conversationStore).isProcessing) {
		conversationStore.addMessage(
			'assistant',
			'Please wait until the current processing is finished.'
		);
		return;
	}

	// Read transactions via get() from the specific store
	const txns = get(transactionStore);
	if (!txns || txns.length === 0) {
		// Check txns directly
		conversationStore.addMessage('assistant', 'No transactions recorded yet to summarise.');
		return;
	}

	// Call actions on the specific store
	conversationStore.setProcessing(true);
	conversationStore.setStatus('Generating summary…', 50);

	let summaryResponse = '';
	const today = new Date().toISOString().split('T')[0];

	try {
		// getSummaryPrompt might need updating if formatCurrencyUtil needs currency codes now
		const promptContent = getSummaryPrompt(txns); // Pass transactions directly
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: promptContent }
		];
		summaryResponse = await llmChat(messages, { temperature: 0.5, rawUserText: promptContent });

		// Fallback summary logic remains similar, but uses formatCurrencyUtil correctly
		if (!summaryResponse?.trim()) {
			// Note: This simple sum doesn't handle multi-currency correctly.
			// A proper summary should likely use the async getCategoryTotalsInBase or similar.
			// For now, keeping the simple (potentially inaccurate) sum as a basic fallback.
			const income = txns
				.filter((t) => t.direction === 'in')
				.reduce((s, t) => s + (t.amount || 0), 0);
			const expense = txns
				.filter((t) => t.direction === 'out')
				.reduce((s, t) => s + (t.amount || 0), 0);
			summaryResponse =
				`Summary based on ${txns.length} recorded transactions: ` +
				// Assuming formatCurrencyUtil defaults to USD or a base currency
				`Total Income: ${formatCurrencyUtil(income)}, ` +
				`Total Expenses: ${formatCurrencyUtil(expense)}. (Note: totals may mix currencies)`;
		}
	} catch (err) {
		console.error('[generateSummary] LLM error:', err);
		conversationStore.setStatus('Error generating summary'); // Use specific store action
		summaryResponse = 'There was an error generating the summary.';
	} finally {
		finishProcessing(summaryResponse); // Uses updated helper
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Abort / Initialize (Updated to use conversationStore)
// ────────────────────────────────────────────────────────────────────────────
export function abortAndClear(): void {
	console.log('[abortAndClear] Clearing conversation and resetting state.');
	// Call actions on the specific store
	conversationStore.reset();
	conversationStore.setProcessing(false); // Ensure processing stops
}

export function initialize(): void {
	console.log('[initialize] Resetting conversation state.');
	// Call action on the specific store
	conversationStore.reset();
}
