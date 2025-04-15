// src/lib/services/ai/conversation.ts
import { get } from 'svelte/store';
// --- FIX: Ensure Transaction, Category, and ConversationMessage types are imported ---
import { v4 as uuidv4 } from 'uuid';

// --- Corrected Store Interaction ---
// Import the main store INSTANCE and its type
import { conversationStore, type ConversationState } from './conversation/conversationStore';
// Import derived stores ONLY for reading state if needed (get(derivedStore))
import { extractedTransactions, isProcessing } from './conversation/conversationDerivedStores';

// Import AI client and prompts
import { deepseekChat, getFallbackResponse, DeepSeekApiError } from './deepseek-client';
import { getSystemPrompt, getSummaryPrompt } from './prompts';

// Import helpers
import { formatCurrency } from '$lib/utils/currency';
import { applyExplicitDirection, textLooksLikeTransaction } from '$lib/utils/helpers';
import { formatDateForDisplay, isBulkData } from './conversation/conversation-helpers';

// Import handler modules
import { handleCorrection } from './conversation/handlers/correction-handler';
import { handleExtraction } from './conversation/handlers/extraction-handler';
import { handleNormalResponse } from './conversation/handlers/normal-response-handler';
import { handleFillDetails } from './conversation/handlers/fill-details-handler';
import { handleInitialData } from './conversation/handlers/initial-data-handler';
import { handleMood } from './conversation/handlers/mood-handler';
import { handleDirectionClarification } from './conversation/handlers/direction-clarification-handler';
import { handleCountCorrection } from './conversation/handlers/count-correction-handler';
import { handleBulkDirectionCorrection } from './conversation/handlers/bulk-direction-handler';

// --- NEW: Import orchestrator for re-extraction ---
import { extractTransactionsFromText } from './extraction/orchestrator';
import type { Category, Transaction } from '$lib/types/transactionTypes';
import { enhancedBackgroundProcessing } from './conversation/bulk/processing';
function getConversationState(): ConversationState {
	return get(conversationStore as any) as ConversationState;
}

// --- Integrated Helper Logic (Previously in conversation-helpers.ts) ---

/**
 * Safely adds an assistant message to the conversation store.
 */
function safeAddAssistantMessageLocal(content: string): void {
	console.log(
		'[safeAddAssistantMessageLocal] Attempting to add message:',
		content.substring(0, 50) + '...'
	);
	conversationStore._addMessage('assistant', content);
}

/**
 * Sets initial processing state and adds the user message.
 */
function startProcessingLocal(message: string): void {
	conversationStore._addMessage('user', message);
	conversationStore._updateStatus('Thinking...', 10);
}

/**
 * Finalizes the processing state and adds the assistant response.
 */
function finishProcessingLocal(assistantResponse: string): void {
	const { initialPromptSent } = conversationStore._getInternalState();
	let finalResponse = assistantResponse;

	if (!finalResponse || !finalResponse.trim()) {
		finalResponse = '';
		console.warn('[finishProcessingLocal] Finishing processing with no assistant message content.');
	}

	conversationStore._updateStatus('Finished', 100);

	if (finalResponse) {
		conversationStore._addMessage('assistant', finalResponse);
	}

	if (!initialPromptSent && finalResponse && textLooksLikeTransaction(finalResponse)) {
		conversationStore._setInitialPromptSent(true);
	}

	console.log('[finishProcessingLocal] Completing processing cycle.');

	setTimeout(() => {
		conversationStore._setProcessing(false);
		// --- FIX (Line 84): Access status directly from get() result ---
		// Avoid assigning get(conversationStore) to a variable here to prevent type error
		if (getConversationState().status !== 'Error') {
			conversationStore._updateStatus('', 0);
		} else {
			conversationStore._updateStatus('Error', 0);
		}
		console.log('[finishProcessingLocal] Reset processing state and progress.');
	}, 300);
}

/**
 * Handles error scenarios during processing.
 */
function handleProcessingErrorLocal(error: unknown): string {
	console.error('[handleProcessingErrorLocal] Processing error:', error);
	conversationStore._updateStatus('Error');

	let message = "I'm having trouble processing that..."; // Default

	// Error message generation logic...
	if (error instanceof DeepSeekApiError) {
		if (error.status === 401 || error.message.includes('Authentication')) {
			message = "I can't connect due to an authentication issue. Please check API configuration.";
		} else if (error.status === 429 || error.message.includes('rate limit')) {
			message = "I've reached my usage limit. Please try again later.";
		} else if (error.status === 500 || error.message.includes('service is experiencing issues')) {
			message = 'The AI service seems to be having issues. Please try again later.';
		} else {
			message = `Sorry, an API error occurred (${error.status || 'network'}): ${error.message}. Please try again.`;
		}
	} else if (error instanceof Error) {
		message = `Sorry, an unexpected error occurred: ${error.message}. Please try again.`;
	} else {
		message = `Sorry, an unknown error occurred. Please try again.`;
	}

	console.log('[handleProcessingErrorLocal] Completed.');
	return message;
}

// --- Initialization and Reset ---
export function initializeConversation(): void {
	resetConversationState();
	safeAddAssistantMessageLocal(
		"Hello! I'm your AI Transaction Assistant. Paste your transaction data, type it out, or describe your spending, and I'll help you organize it. How can I help you get started?"
	);
}

export function resetConversationState(): void {
	conversationStore.reset();
}

// --- Conversation Actions ---
export function completeConversation(): Transaction[] {
	const txns = get(extractedTransactions) as Transaction[];
	resetConversationState();
	return txns;
}

export function abortConversation(): void {
	resetConversationState();
	safeAddAssistantMessageLocal('Okay, starting fresh. How can I help you?');
}

// --- Local Handlers (Using conversationStore methods) ---

function handleBulkDirectionCorrectionLocal(message: string): {
	handled: boolean;
	response: string;
} {
	const currentTxns = get(extractedTransactions) as Transaction[];
	if (currentTxns.length === 0) {
		return { handled: false, response: '' };
	}
	const lowerMessage = message.toLowerCase().trim();
	let targetDirection: 'in' | 'out' | null = null;
	let targetCategory: Category | null = null;

	// Determine targetDirection/targetCategory...
	if (/\b(they'?re all in|all in|all income|all credit|mark all as in)\b/.test(lowerMessage)) {
		targetDirection = 'in';
	} else if (
		/\b(they'?re all out|all out|all expenses?|all debit|mark all as out|mark all as expense)\b/.test(
			lowerMessage
		)
	) {
		targetDirection = 'out';
		targetCategory = 'Expenses';
	}

	if (targetDirection) {
		console.log(`[handleBulkDirectionCorrectionLocal] Applying bulk update: ${targetDirection}`);
		let changedCount = 0;
		conversationStore.update((currentState: ConversationState): ConversationState => {
			const updatedTxns = currentState.extractedTransactions.map(
				(txn: Transaction): Transaction => {
					let updatedTxn = { ...txn };
					let changed = false;
					if (updatedTxn.direction !== targetDirection) {
						updatedTxn.direction = targetDirection!;
						changed = true;
					}
					if (
						targetCategory &&
						targetDirection === 'out' &&
						updatedTxn.category !== targetCategory
					) {
						updatedTxn.category = targetCategory;
						changed = true;
					} else if (targetDirection === 'in' && updatedTxn.category === 'Expenses') {
						updatedTxn.category = 'Other / Uncategorized';
						changed = true;
					}
					if (changed) changedCount++;
					return updatedTxn;
				}
			);
			return { ...currentState, extractedTransactions: updatedTxns };
		});
		const response =
			changedCount > 0
				? `Okay, I've updated ${changedCount} transaction${changedCount !== 1 ? 's' : ''}...`
				: `Okay, it looks like all ${currentTxns.length} transactions were already marked...`; // Simplified response
		return { handled: true, response: response };
	}
	return { handled: false, response: '' };
}

function handleDirectionClarificationLocal(message: string): {
	handled: boolean;
	response: string;
} {
	const state = conversationStore._getInternalState();
	if (!state.waitingForDirectionClarification || state.clarificationTxnIds.length === 0) {
		return { handled: false, response: '' };
	}

	console.log('[handleDirectionClarificationLocal] Applying direction clarification...');
	const lowerMessage = message.toLowerCase();
	let directionsApplied = 0;
	let clarifiedDirection: 'in' | 'out' | null = null;

	// Determine direction...
	if (
		/\b(in|income|credit)\b/.test(lowerMessage) &&
		!/\b(out|expense|debit)\b/.test(lowerMessage)
	) {
		clarifiedDirection = 'in';
	} else if (
		/\b(out|expense|debit)\b/.test(lowerMessage) &&
		!/\b(in|income|credit)\b/.test(lowerMessage)
	) {
		clarifiedDirection = 'out';
	}

	if (clarifiedDirection) {
		conversationStore.update((currentState: ConversationState): ConversationState => {
			const updatedTxns = currentState.extractedTransactions.map(
				(txn: Transaction): Transaction => {
					if (
						txn.id != null &&
						state.clarificationTxnIds.includes(txn.id) &&
						txn.direction === 'unknown'
					) {
						directionsApplied++;
						let newCategory = txn.category;
						if (clarifiedDirection === 'out' && newCategory !== 'Expenses')
							newCategory = 'Expenses';
						else if (clarifiedDirection === 'in' && newCategory === 'Expenses')
							newCategory = 'Other / Uncategorized';
						return { ...txn, direction: clarifiedDirection, category: newCategory };
					}
					return txn;
				}
			);
			return { ...currentState, extractedTransactions: updatedTxns };
		});
		conversationStore._setClarificationNeeded(false, []);
		const response = `Got it! I've updated ${directionsApplied} transaction${directionsApplied !== 1 ? 's' : ''}...`; // Simplified
		return { handled: true, response: response };
	} else {
		const response = "Sorry, I couldn't quite understand... Use 'IN' or 'OUT'?"; // Simplified
		return { handled: true, response: response };
	}
}

async function handleCountCorrectionLocal(
	message: string
): Promise<{ handled: boolean; response: string }> {
	const lowerMessage = message.toLowerCase().trim();
	const countMatch = lowerMessage.match(
		/(?:you missed one|there (?:were|was) (\d+)|i see (\d+)|count was wrong|should be (\d+))/i
	);
	const state = conversationStore._getInternalState();

	if (countMatch && state.lastUserMessageText) {
		console.log('[handleCountCorrectionLocal] Detected count correction.');
		const originalInput = state.lastUserMessageText;
		conversationStore._updateExtractedTransactions([], originalInput, 'correction-clear');
		conversationStore._updateStatus('Re-analyzing previous input...', 30);

		let newTxns: Transaction[] = [];
		let extractionError: unknown = null;
		try {
			console.log(`[handleCountCorrectionLocal] Re-extracting based on user hint: "${message}"`);
			newTxns = await extractTransactionsFromText(originalInput);
		} catch (err) {
			extractionError = err;
			console.error('[handleCountCorrectionLocal] Error:', err);
		}

		conversationStore._updateStatus('Re-analysis complete', 90);

		if (extractionError) {
			return { handled: true, response: handleProcessingErrorLocal(extractionError) };
		}

		if (newTxns.length > 0) {
			conversationStore._updateExtractedTransactions(newTxns, originalInput, 'correction-update');
			const unknownDirectionTxns = newTxns.filter((t) => t.direction === 'unknown');
			let response = `Okay, I took another look... I now have ${newTxns.length} transactions:\n\n`; // Simplified

			// Response generation... (simplified for brevity)
			const maxToList = 3; // Show fewer in correction response
			newTxns.slice(0, maxToList).forEach((txn, index) => {
				const amtNum = typeof txn.amount === 'number' ? txn.amount : 0;
				response += `${index + 1}. ${formatCurrency(amtNum)} ${txn.description !== 'unknown' ? `for "${txn.description}"` : ''} (${txn.date})\n`;
			});
			if (newTxns.length > maxToList) {
				response += `...and ${newTxns.length - maxToList} more.\n`;
			}

			// Clarification check...
			if (unknownDirectionTxns.length > 0) {
				response += `\nStill need clarification on IN/OUT for some.`; // Simplified
				conversationStore._setClarificationNeeded(
					true,
					unknownDirectionTxns.map((t) => t.id).filter((id) => id != null) as string[]
				);
			} else {
				response += '\nDoes this look correct now?';
				conversationStore._setClarificationNeeded(false, []);
			}
			conversationStore._clearLastInputContext();
			return { handled: true, response: response };
		} else {
			conversationStore._clearLastInputContext();
			return {
				handled: true,
				response: 'Apologies, I tried re-analyzing... Could you provide the details again?'
			}; // Simplified
		}
	}
	return { handled: false, response: '' };
}

/**
 * Main message handler
 */
export async function sendUserMessage(message: string): Promise<void> {
	// Strict Guard
	if (get(isProcessing)) {
		console.warn('[sendUserMessage] Already processing. Ignored:', message);
		safeAddAssistantMessageLocal("I'm still working on the previous request..."); // Use local helper
		return;
	}
	if (!message || message.trim().length === 0) {
		return;
	}

	conversationStore._setProcessing(true);
	startProcessingLocal(message); // Use local helper

	let assistantResponse = '';
	let handled = false;
	let delegatedToBackground = false;
	let explicitDirectionIntent: 'in' | 'out' | null = null;

	// Detect explicit direction intent...
	const lowerMessage = message.toLowerCase();
	// Define or import BULK_DIRECTION_ALL_IN_REGEX, BULK_DIRECTION_ALL_OUT_REGEX
	// if (BULK_DIRECTION_ALL_IN_REGEX.test(lowerMessage) && message.length < 50) { ... }
	// if (BULK_DIRECTION_ALL_OUT_REGEX.test(lowerMessage) && message.length < 50) { ... }

	try {
		// --- Message Handling Pipeline ---

		// 0. Clarification
		const clarificationResult = handleDirectionClarificationLocal(message);
		if (clarificationResult.handled) {
			assistantResponse = clarificationResult.response;
			handled = true;
		}

		// 1. Mood
		if (!handled) {
			const moodResult = await handleMood(message);
			if (moodResult.handled) {
				if (moodResult.response !== undefined) {
					assistantResponse = moodResult.response;
				} else {
					return;
				}
				handled = true;
			}
		}

		// 2. Count Correction
		if (!handled) {
			const countCorrectionResult = await handleCountCorrectionLocal(message);
			if (countCorrectionResult.handled) {
				assistantResponse = countCorrectionResult.response;
				handled = true;
			}
		}

		// 3. Initial Data
		if (!handled) {
			const initialDataResult = await handleInitialData(message, explicitDirectionIntent);
			if (initialDataResult.handled) {
				return;
			}
		}

		// 4. Bulk Data
		if (!handled && isBulkData(message)) {
			const bulkResult = await enhancedBackgroundProcessing(message);
			if (bulkResult.handled) {
				safeAddAssistantMessageLocal(bulkResult.response);
				delegatedToBackground = true;
				handled = true;
				assistantResponse = '';
			}
		}

		// --- If not delegated ---
		if (!delegatedToBackground) {
			// 5. Bulk Direction
			if (!handled) {
				const bulkCorrectionResult = handleBulkDirectionCorrectionLocal(message);
				if (bulkCorrectionResult.handled) {
					assistantResponse = bulkCorrectionResult.response;
					handled = true;
				}
			}

			// 6. Fill Details
			if (!handled) {
				const detailsResult = await handleFillDetails(message);
				if (detailsResult.handled) {
					assistantResponse = detailsResult.response ?? '';
					handled = true;
				}
			}

			// 7. Extraction
			if (!handled) {
				const extractionResult = await handleExtraction(message, explicitDirectionIntent);
				if (extractionResult.handled) {
					assistantResponse = extractionResult.response ?? '';
					handled = true;
				}
			}

			// 8. Normal Response Fallback
			if (!handled) {
				const normalResult = await handleNormalResponse(message);
				assistantResponse = normalResult.response ?? getFallbackResponse();
				handled = true;
			}

			// 9. Correction handler (Placeholder call)
			await handleCorrection(assistantResponse);

			if (handled && !assistantResponse) {
				console.warn('[Service sendMessage] Handler successful but no response content.');
			}
		} // --- End if (!delegatedToBackground) ---
	} catch (error) {
		console.error('[Service sendMessage] Error during handler pipeline:', error);
		assistantResponse = handleProcessingErrorLocal(error); // Use local helper
		handled = true;
	} finally {
		console.log(
			`[Service sendMessage] Finally block. Delegated: ${delegatedToBackground}, Handled: ${handled}`
		);
		if (!delegatedToBackground) {
			finishProcessingLocal(assistantResponse); // Use local helper
		} else {
			console.log(
				'[Service sendMessage] Delegated to background, skipping immediate finishProcessing call.'
			);
			conversationStore._setProcessing(true); // Ensure processing stays true
		}
	}
}

/**
 * Generates a summary message based on currently extracted transactions.
 */
export async function generateSummary(): Promise<void> {
	if (get(isProcessing)) {
		safeAddAssistantMessageLocal('Please wait until the current processing is finished...');
		return;
	}
	const txns = get(extractedTransactions) as Transaction[];
	if (txns.length === 0) {
		safeAddAssistantMessageLocal("I haven't recorded any transactions yet...");
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

		// Retry logic...
		let retries = 2;
		let error: unknown = null;
		while (retries >= 0) {
			try {
				summaryResponse = await deepseekChat(messages);
				if (summaryResponse) break;
				else throw new Error('Empty summary response');
			} catch (err) {
				error = err;
				retries--;
				console.log(`[generateSummary] Error, retries left: ${retries}`, err);
				if (retries < 0) break;
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		if (!summaryResponse && error) {
			console.error('[generateSummary] Failed after retries:', error);
			// --- FIX: Add types to filter/reduce callbacks ---
			const incomeTotal = txns
				.filter((t: Transaction) => t.direction === 'in')
				.reduce((sum: number, t: Transaction) => sum + (Number(t.amount) || 0), 0);
			const expenseTotal = txns
				.filter((t: Transaction) => t.direction === 'out')
				.reduce((sum: number, t: Transaction) => sum + (Number(t.amount) || 0), 0);
			summaryResponse = `I had trouble generating a detailed analysis. Based on data: ${txns.length} txn(s), In: ${formatCurrency(incomeTotal)}, Out: ${formatCurrency(expenseTotal)}.`; // Simplified
			conversationStore._updateStatus('Error generating summary');
		} else if (!summaryResponse || !summaryResponse.trim()) {
			summaryResponse = `I have recorded ${txns.length} transaction(s). Add to main list or make changes?`; // Simplified
		}
	} catch (err) {
		console.error('[generateSummary] LLM error:', err);
		const txnsCount = (get(extractedTransactions) as Transaction[]).length;
		summaryResponse = `I have ${txnsCount} transaction(s) recorded. Add them to your main list?`; // Simplified
		conversationStore._updateStatus('Error');
	} finally {
		finishProcessingLocal(summaryResponse); // Use local helper
	}
}

// Export renamed methods to match expected function names in imports
export const sendMessage = sendUserMessage;
export const completeAndClear = completeConversation;
export const abortAndClear = abortConversation;
