// src/lib/services/ai/conversation.ts
import { get } from 'svelte/store';
import type { Transaction, Category } from '$lib/types'; // Import Category
import { deepseekChat, getFallbackResponse } from './deepseek-client';
import { getSystemPrompt, getSummaryPrompt } from './prompts';
import { formatCurrency } from '$lib/utils/currency'; // Import formatCurrency

// Import stores
import {
	conversationMessages,
	conversationStatus,
	isProcessing,
	conversationProgress,
	extractedTransactions,
	userMood,
	getState,
	setState,
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
import { startBackgroundProcessing } from './conversation/bulk/processing';
import { handleInitialData } from './conversation/initial-data-handler';
import { handleUserMood } from './conversation/mood-handler';
// --- NEW: Import orchestrator for re-extraction ---
import { extractTransactionsFromText } from './extraction/orchestrator';

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
	setState({
		initialPromptSent: false,
		messageInProgress: false,
		messageStartTime: 0,
		waitingForDirectionClarification: false,
		clarificationTxnIds: [],
		// --- NEW ---
		lastInputTextForTransactions: '',
		lastTransactionBatchId: null
	});
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

// --- Handler for Bulk Direction Correction ---
function handleBulkDirectionCorrection(message: string): { handled: boolean; response: string } {
	const currentTxns = get(extractedTransactions);
	if (currentTxns.length === 0) {
		return { handled: false, response: '' };
	}
	const lowerMessage = message.toLowerCase().trim();
	let targetDirection: 'in' | 'out' | null = null;
	let targetCategory: Category | null = null;

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
		console.log(
			`[handleBulkDirectionCorrection] Applying bulk update to direction: ${targetDirection}`
		);
		let changedCount = 0;
		extractedTransactions.update((txns) => {
			return txns.map((txn) => {
				let updatedTxn = { ...txn };
				let changed = false;
				if (updatedTxn.direction !== targetDirection) {
					updatedTxn.direction = targetDirection!;
					changed = true;
				}
				if (targetCategory && targetDirection === 'out' && updatedTxn.category !== targetCategory) {
					updatedTxn.category = targetCategory;
					changed = true;
				} else if (targetDirection === 'in' && updatedTxn.category === 'Expenses') {
					updatedTxn.category = 'Other / Uncategorized';
					changed = true;
				}
				if (changed) changedCount++;
				return updatedTxn;
			});
		});

		if (changedCount > 0) {
			return {
				handled: true,
				response: `Okay, I've updated ${changedCount} transaction${changedCount !== 1 ? 's' : ''} to be marked as ${targetDirection === 'in' ? 'IN' : 'OUT'}${targetCategory ? ' and categorized as Expenses' : ''}.`
			};
		} else {
			return {
				handled: true,
				response: `Okay, it looks like all ${currentTxns.length} transactions were already marked as ${targetDirection === 'in' ? 'IN' : 'OUT'}. No changes needed.`
			};
		}
	}
	return { handled: false, response: '' };
}

// --- Handler for Clarifying Unknown Directions ---
function handleDirectionClarification(message: string): { handled: boolean; response: string } {
	const state = getState();
	if (!state.waitingForDirectionClarification || state.clarificationTxnIds.length === 0) {
		return { handled: false, response: '' };
	}

	console.log('[handleDirectionClarification] Attempting to apply direction clarification...');
	const lowerMessage = message.toLowerCase();
	let directionsApplied = 0;
	let response = "Thanks! I've updated the directions.";
	let clarifiedDirection: 'in' | 'out' | null = null;

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
		extractedTransactions.update((txns) => {
			return txns.map((txn) => {
				if (
					txn.id != null &&
					state.clarificationTxnIds.includes(txn.id) &&
					txn.direction === 'unknown'
				) {
					directionsApplied++;
					let newCategory = txn.category;
					if (clarifiedDirection === 'out' && newCategory !== 'Expenses') {
						newCategory = 'Expenses';
					} else if (clarifiedDirection === 'in' && newCategory === 'Expenses') {
						newCategory = 'Other / Uncategorized';
					}
					return { ...txn, direction: clarifiedDirection, category: newCategory };
				}
				return txn;
			});
		});
		console.log(
			`[handleDirectionClarification] Applied direction '${clarifiedDirection}' to ${directionsApplied} transactions.`
		);
		response = `Got it! I've updated ${directionsApplied} transaction${directionsApplied !== 1 ? 's' : ''} as ${clarifiedDirection === 'in' ? 'IN' : 'OUT'}.`;
	} else {
		console.log(
			'[handleDirectionClarification] Could not determine clear IN/OUT from user response.'
		);
		response =
			"Sorry, I couldn't quite understand if those were IN or OUT. Could you try again using the words 'IN' or 'OUT'?";
		setState({ waitingForDirectionClarification: true });
		return { handled: true, response: response };
	}

	setState({ waitingForDirectionClarification: false, clarificationTxnIds: [] });
	return { handled: true, response: response };
}

// --- NEW: Handler for Correcting Extraction Count ---
async function handleCountCorrection(
	message: string
): Promise<{ handled: boolean; response: string }> {
	const lowerMessage = message.toLowerCase().trim();
	// Look for phrases indicating a count mismatch
	const countMatch = lowerMessage.match(
		/(?:you missed one|there (?:were|was) (\d+)|i see (\d+)|count was wrong)/i
	);
	const state = getState();

	// Only proceed if a mismatch is mentioned and we have the previous input text
	if (countMatch && state.lastInputTextForTransactions) {
		console.log('[handleCountCorrection] Detected count correction request.');
		const originalInput = state.lastInputTextForTransactions;

		// Clear the potentially incorrect last batch of transactions before re-extracting
		// This simple approach clears ALL transactions. More complex logic could target specific batches.
		console.log(
			'[handleCountCorrection] Clearing existing extracted transactions before re-extraction.'
		);
		extractedTransactions.set([]); // Clear all for simplicity

		// Re-run extraction on the original text
		conversationStatus.set('Re-analyzing previous input...');
		conversationProgress.set(30);
		let newTxns: Transaction[] = [];
		let extractionError = null;
		try {
			newTxns = await extractTransactionsFromText(originalInput);
		} catch (err) {
			extractionError = err;
			console.error('[handleCountCorrection] Error during re-extraction:', err);
		}

		conversationProgress.set(90);

		if (extractionError) {
			return { handled: true, response: handleProcessingError(extractionError) };
		}

		if (newTxns.length > 0) {
			extractedTransactions.set(newTxns); // Set the store with the new results
			// Check for unknown directions in the new results
			const unknownDirectionTxns = newTxns.filter((t) => t.direction === 'unknown');
			let response = `You're right, my apologies! I've re-analyzed and found ${newTxns.length} transactions this time:\n\n`;
			const maxToList = 5;
			newTxns.slice(0, maxToList).forEach((txn, index) => {
				const amtNum =
					typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/[$,]/g, '')) : txn.amount;
				const directionDisplay =
					txn.direction === 'in' ? 'received' : txn.direction === 'out' ? 'spent' : '(direction?)';
				response += `${index + 1}. ${formatCurrency(amtNum)} ${directionDisplay} ${txn.description !== 'unknown' ? `for "${txn.description}" ` : ''}${txn.date !== 'unknown' ? `on ${formatDateForDisplay(txn.date)}` : ''}\n`;
			});
			if (newTxns.length > maxToList) {
				response += `...and ${newTxns.length - maxToList} more.\n`;
			}

			if (unknownDirectionTxns.length > 0) {
				response += `\nHowever, for ${unknownDirectionTxns.length === 1 ? 'one' : 'some'} of these, I wasn't sure if the money was coming IN or going OUT. Could you clarify for:\n`;
				unknownDirectionTxns.slice(0, 3).forEach((t) => {
					response += `- ${t.date} / ${t.description} / ${formatCurrency(t.amount)}\n`;
				});
				if (unknownDirectionTxns.length > 3) {
					response += `- ...and ${unknownDirectionTxns.length - 3} more.\n`;
				}
				response += `\nYou can say something like "the first was IN, the rest were OUT".`;
				setState({
					waitingForDirectionClarification: true,
					clarificationTxnIds: unknownDirectionTxns.map((t) => t.id)
				});
			} else {
				response += '\nIs this correct now?';
				// Reset clarification state if no unknowns found on re-scan
				setState({ waitingForDirectionClarification: false, clarificationTxnIds: [] });
			}
			// Reset last input text after correction to prevent re-correction loop
			setState({ lastInputTextForTransactions: '', lastTransactionBatchId: null });
			return { handled: true, response: response };
		} else {
			// Re-extraction failed to find any transactions
			setState({ lastInputTextForTransactions: '', lastTransactionBatchId: null }); // Reset state
			return {
				handled: true,
				response:
					"Apologies, I tried re-analyzing but still couldn't extract the transactions correctly from your previous message. Could you please provide the details again?"
			};
		}
	}

	return { handled: false, response: '' }; // No count correction detected
}

/**
 * Main message handler
 */
export async function sendUserMessage(message: string): Promise<void> {
	// --- Strict Guard ---
	if (get(isProcessing)) {
		console.warn('[sendUserMessage] Already processing. Ignored:', message);
		safeAddAssistantMessage("I'm still working on the previous request. Please wait.");
		return;
	}
	// --- End Strict Guard ---

	if (!message || message.trim().length === 0) {
		console.warn('[sendUserMessage] Empty message. Ignored.');
		return;
	}

	isProcessing.set(true);
	startProcessing(message);

	let assistantResponse = '';
	let handled = false;
	let delegatedToBackground = false;

	try {
		// --- Message Handling Pipeline ---

		// 0. Check if waiting for direction clarification
		const clarificationResult = handleDirectionClarification(message);
		if (clarificationResult.handled) {
			assistantResponse = clarificationResult.response;
			handled = true;
		}

		// 1. Check for mood indicators
		if (!handled) {
			const moodResult = handleUserMood(message);
			if (moodResult.handled) {
				assistantResponse = moodResult.response;
				safeAddAssistantMessage(assistantResponse);
				isProcessing.set(false);
				conversationStatus.set('');
				conversationProgress.set(0);
				return;
			}
		}

		// --- NEW: 2. Check for Count Correction ---
		if (!handled) {
			const countCorrectionResult = await handleCountCorrection(message);
			if (countCorrectionResult.handled) {
				assistantResponse = countCorrectionResult.response;
				handled = true;
				// This handler manages its own state/response posting via finishProcessing if needed
				// but currently returns response to be handled by the main finally block
			}
		}

		// 3. Handle initial data
		if (!handled) {
			const initialDataResult = await handleInitialData(message);
			if (initialDataResult.handled) {
				return; // Exits and handles its own finishProcessing
			}
		}

		// 4. Handle Bulk Data Processing
		if (!handled && isBulkData(message)) {
			const bulkResult = await startBackgroundProcessing(message);
			if (bulkResult.handled) {
				assistantResponse = bulkResult.response;
				safeAddAssistantMessage(assistantResponse);
				delegatedToBackground = true;
				return; // Exit, background task handles the rest
			}
		}

		// --- If delegated to background, skip remaining handlers ---
		if (!delegatedToBackground) {
			// 5. Check for Bulk Direction Correction
			if (!handled) {
				const bulkCorrectionResult = handleBulkDirectionCorrection(message);
				if (bulkCorrectionResult.handled) {
					assistantResponse = bulkCorrectionResult.response;
					handled = true;
				}
			}

			// 6. Try to fill in missing details
			if (!handled) {
				const detailsResult = fillMissingDetails(message);
				if (detailsResult.handled) {
					assistantResponse = detailsResult.response;
					handled = true;
				}
			}

			// 7. Try to extract new transactions
			let extractedCount = 0;
			if (!handled) {
				const extractionResult = await extractNewTransaction(message);
				if (extractionResult.handled) {
					assistantResponse = extractionResult.response;
					extractedCount = extractionResult.extractedCount;
					handled = true;

					// Check for unknown directions after extraction
					if (extractedCount > 0) {
						const currentTxns = get(extractedTransactions);
						const newlyAddedTxns = currentTxns.slice(-extractedCount);
						const unknownDirectionTxns = newlyAddedTxns.filter((t) => t.direction === 'unknown');

						if (unknownDirectionTxns.length > 0) {
							let clarificationQuestion = `${assistantResponse}\n\nHowever, for ${unknownDirectionTxns.length === 1 ? 'one' : 'some'} of these, I wasn't sure if the money was coming IN or going OUT. Could you clarify for:\n`;
							unknownDirectionTxns.slice(0, 3).forEach((t) => {
								clarificationQuestion += `- ${t.date} / ${t.description} / ${formatCurrency(t.amount)}\n`;
							});
							if (unknownDirectionTxns.length > 3) {
								clarificationQuestion += `- ...and ${unknownDirectionTxns.length - 3} more.\n`;
							}
							clarificationQuestion += `\nYou can say something like "the first was IN, the rest were OUT".`;
							setState({
								waitingForDirectionClarification: true,
								clarificationTxnIds: unknownDirectionTxns.map((t) => t.id)
							});
							assistantResponse = clarificationQuestion;
						}
					}
				}
			}

			// 8. Fall back to normal LLM conversation
			if (!handled) {
				console.log(
					'[sendUserMessage] No specific handler processed the message, falling back to normal response.'
				);
				assistantResponse = await getNormalResponse(message);
				handled = true;
			}

			// 9. Check if the AI response suggests a specific correction
			const correctionResult = await handleCorrection(assistantResponse);
			if (correctionResult.applied) {
				assistantResponse = correctionResult.updatedResponse;
				console.log('[sendUserMessage] Applied specific correction based on assistant response.');
			}
		} // --- End if (!delegatedToBackground) ---
	} catch (error) {
		assistantResponse = handleProcessingError(error);
	} finally {
		// Only call finishProcessing if the task wasn't delegated
		if (!delegatedToBackground) {
			finishProcessing(assistantResponse);
		}
	}
}

/**
 * Generates a summary message based on currently extracted transactions.
 */
export async function generateSummary(): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[generateSummary] Already processing, ignoring...');
		safeAddAssistantMessage(
			'Please wait until the current processing is finished before generating a summary.'
		);
		return;
	}

	const txns = get(extractedTransactions);
	if (txns.length === 0) {
		safeAddAssistantMessage(
			"I haven't recorded any transactions yet. Please share some transaction details with me first."
		);
		return;
	}

	isProcessing.set(true);
	conversationStatus.set('Generating summary...');
	conversationProgress.set(50);

	let summaryResponse = '';
	const today = new Date().toISOString().split('T')[0];

	try {
		const promptContent = getSummaryPrompt(txns);
		const summaryMsgs = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: promptContent }
		];

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
				if (retries >= 0) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		}

		if (!summaryResponse && error) {
			console.error('[generateSummary] Failed after retries:', error);
			summaryResponse = getSummaryPrompt(txns);
			summaryResponse +=
				'\n\n(I had some trouble generating a detailed analysis. This is a basic summary.)';
		}

		if (!summaryResponse || !summaryResponse.trim()) {
			summaryResponse = `I have recorded ${txns.length} transaction(s). Would you like to add them to your main list or make any changes?`;
		}
	} catch (err) {
		console.error('[generateSummary] LLM error:', err);
		summaryResponse = `I have ${txns.length} transaction(s) recorded. Would you like to add them to your main list?`;
		conversationStatus.set('Error');
	} finally {
		finishProcessing(summaryResponse);
	}
}

// Export helper functions - No change needed
export {
	safeAddAssistantMessage,
	formatDateForDisplay,
	isBulkData,
	processInitialData,
	setState,
	getState
};

// --- NOTE: UUID Change Reminder ---
// The local extractor was updated to use uuidv4().
// Ensure the Transaction type definition in src/lib/types/transaction.ts
// has id: string;
// Also update llm-parser.ts to use uuidv4() if LLM extraction is used.
