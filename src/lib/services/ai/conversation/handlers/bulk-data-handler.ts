// --- FILENAME: src/lib/services/ai/conversation/handlers/bulk-data-handler.ts ---

import { conversationStore } from '../conversationStore';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid'; // For generating batch IDs

// AI Client and Prompts
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';

// Constants
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants';

// Bulk Processing Helpers
import { llmChunkTransactions } from '../bulk/llm-chunking';
import { deduplicateTransactions, getCategoryBreakdown } from '../bulk/processing-helpers';
import { categorizeTransaction } from '$lib/services/categorizer';
import type { Transaction } from '$lib/stores/types';

// Categorizer (needed for local applyExplicitDirection)

// --- Locally Defined Helper Functions (Workaround for missing exports) ---

/**
 * Attempts to fix common JSON errors in LLM responses.
 * @param jsonStr The potentially malformed JSON string.
 * @returns A string with attempted fixes.
 */
function fixCommonJsonErrors(jsonStr: string): string {
	if (!jsonStr || typeof jsonStr !== 'string') return '';
	let fixed = jsonStr.trim();
	// Remove markdown code fences
	fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	// Replace Python/JS boolean/null literals
	fixed = fixed.replace(/\bNone\b/g, 'null');
	fixed = fixed.replace(/\bTrue\b/g, 'true');
	fixed = fixed.replace(/\bFalse\b/g, 'false');
	// Add quotes around keys that might be missing them
	fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
	// Remove trailing commas before closing brackets/braces
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');
	return fixed;
}

/**
 * Parses JSON from AI response, attempting to fix common errors.
 * @param jsonResponse The raw string response from the AI.
 * @returns Parsed JSON object or array, or null if parsing fails.
 */
function parseJsonFromAiResponse<T = any>(jsonResponse: string): T | null {
	if (!jsonResponse || typeof jsonResponse !== 'string') {
		return null;
	}
	try {
		return JSON.parse(jsonResponse);
	} catch (e) {
		console.warn('[parseJsonFromAiResponse] Initial JSON parse failed, attempting to fix...');
		try {
			const fixedJson = fixCommonJsonErrors(jsonResponse);
			return JSON.parse(fixedJson);
		} catch (fixError) {
			console.error('[parseJsonFromAiResponse] Failed to parse JSON even after fixing:', fixError);
			console.error('[parseJsonFromAiResponse] Original problematic JSON string:', jsonResponse);
			return null;
		}
	}
}

/**
 * Applies an explicit direction override (if provided) to a list of transactions.
 * Also adjusts category based on the new direction.
 * @param transactions The list of transactions to potentially modify.
 * @param explicitDirection 'in', 'out', or null.
 * @returns The modified list of transactions.
 */
function applyExplicitDirection(
	transactions: Transaction[],
	explicitDirection: 'in' | 'out' | null
): Transaction[] {
	if (!explicitDirection) {
		return transactions;
	}
	return transactions.map((txn) => {
		let updatedTxn = { ...txn };
		if (updatedTxn.direction !== explicitDirection) {
			updatedTxn.direction = explicitDirection;
			if (explicitDirection === 'out') {
				if (updatedTxn.category !== 'Expenses') {
					updatedTxn.category = 'Expenses';
				}
			} else if (explicitDirection === 'in') {
				if (updatedTxn.category === 'Expenses') {
					const potentialCategory = categorizeTransaction(updatedTxn.description, updatedTxn.type);
					if (potentialCategory === 'Expenses') {
						updatedTxn.category = 'Other / Uncategorized';
					} else {
						updatedTxn.category = potentialCategory;
					}
				}
			}
		}
		return updatedTxn;
	});
}

// --- Main Handler Function ---

/**
 * Handles messages containing bulk transaction data using an LLM chunking strategy.
 * Initiates a background processing task.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled.
 */
export async function handleBulkData(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean }> {
	// Condition: Message length exceeds the threshold
	if (message.length < BULK_DATA_THRESHOLD_LENGTH) {
		return { handled: false };
	}

	console.log('[BulkDataHandler] Handling bulk transaction data using chunking strategy.');

	// Acknowledge receipt and inform user about background processing
	conversationStore._addMessage(
		'assistant',
		"That looks like a lot of data! I'll ask the AI to identify individual transactions first, then process them. This might take a moment..."
	);
	conversationStore._updateStatus('Identifying transaction chunks...', 5);

	// --- Define the background task ---
	const backgroundTask = async (taskId: string) => {
		let allExtractedTxns: Transaction[] = [];
		let chunkProcessingErrorOccurred = false;
		const batchId = uuidv4(); // Unique ID for this extraction batch

		try {
			// Pass taskId to status updates if store supports it (modify _updateStatus if needed)
			conversationStore._updateStatus('AI identifying chunks...', 10 /*, taskId */); // Add taskId if supported

			// --- Step 1: Get chunks from LLM ---
			const llmChunks = await llmChunkTransactions(message);
			const totalChunks = llmChunks.length;

			if (totalChunks === 0) {
				console.warn(`[BulkTask ${taskId}] LLM chunking returned 0 chunks.`);
				conversationStore._addMessage(
					'assistant',
					'The AI could not identify distinct transaction blocks in your text. Please check the format or try again.'
				);
				// No need to call _setProcessing(false) here, finally block handles it.
				return; // Exit background task
			}

			console.log(
				`[BulkTask ${taskId}] LLM identified ${totalChunks} potential transaction chunks.`
			);
			conversationStore._updateStatus(
				`Processing ${totalChunks} identified chunks (0%)...`,
				20 /*, taskId */
			);

			// --- Step 2: Process each chunk ---
			for (let i = 0; i < totalChunks; i++) {
				const chunk = llmChunks[i];
				const progressPercent = 20 + Math.round(((i + 1) / totalChunks) * 70);
				conversationStore._updateStatus(
					`Processing chunk ${i + 1}/${totalChunks} (${progressPercent}%)...`,
					progressPercent /*, taskId */
				);
				console.log(`[BulkTask ${taskId}] Processing chunk ${i + 1}/${totalChunks}...`);

				try {
					const today = new Date().toISOString().split('T')[0];
					const extractionPrompt = getExtractionPrompt(chunk, today);
					const extractionMessages = [
						{ role: 'system', content: getSystemPrompt(today) },
						{ role: 'user', content: extractionPrompt }
					];

					const aiResponse = await deepseekChat(extractionMessages, { temperature: 0.1 });
					let parsedTransactions: Transaction[] | null =
						parseJsonFromAiResponse<Transaction[]>(aiResponse);

					if (parsedTransactions && parsedTransactions.length > 0) {
						let finalChunkTransactions = applyExplicitDirection(
							parsedTransactions,
							explicitDirectionIntent
						);
						allExtractedTxns.push(...finalChunkTransactions);
						// console.log(`[BulkTask ${taskId}] Extracted ${finalChunkTransactions.length} txns from chunk ${i + 1}. Total now: ${allExtractedTxns.length}`);
					} else if (aiResponse && (!parsedTransactions || parsedTransactions.length === 0)) {
						console.log(
							`[BulkTask ${taskId}] No transactions extracted or parsed from chunk ${i + 1}.`
						);
					} else if (!aiResponse) {
						console.warn(`[BulkTask ${taskId}] Empty response from AI for chunk ${i + 1}.`);
					}
				} catch (chunkError) {
					console.error(`[BulkTask ${taskId}] Error processing chunk ${i + 1}:`, chunkError);
					chunkProcessingErrorOccurred = true;
				}
			}

			conversationStore._updateStatus('Finalizing results...', 95 /*, taskId */);

			// --- Step 3: Deduplicate and Summarize ---
			const uniqueTransactions = deduplicateTransactions(allExtractedTxns);
			console.log(
				`[BulkTask ${taskId}] Deduplicated ${allExtractedTxns.length} -> ${uniqueTransactions.length} transactions.`
			);

			let finalMessage = '';
			if (uniqueTransactions.length > 0) {
				// NOTE: Ensure _appendExtractedTransactions exists and accepts batchId
				conversationStore._appendExtractedTransactions(uniqueTransactions, message, batchId);

				const categoryBreakdown = getCategoryBreakdown(uniqueTransactions);
				finalMessage = `Finished processing! I found ${uniqueTransactions.length} unique transaction(s).\n\n${categoryBreakdown}\n\n`;
				if (chunkProcessingErrorOccurred) {
					finalMessage +=
						'Note: Some parts of your data might have caused errors during processing.\n\n';
				}
				finalMessage += `You can review the extracted transactions now.`;

				// Optional: Check for Direction Clarification
				const hasIn = uniqueTransactions.some((t) => t.direction === 'in');
				const hasOut = uniqueTransactions.some((t) => t.direction === 'out');
				let needsClarification = false;
				if (!explicitDirectionIntent && !hasIn && !hasOut && uniqueTransactions.length > 0) {
					needsClarification = true;
				}

				if (needsClarification) {
					console.log(`[BulkTask ${taskId}] Requesting direction clarification for bulk results.`);
					// NOTE: Ensure _setClarificationNeeded exists and takes (boolean, string[])
					conversationStore._setClarificationNeeded(
						true,
						uniqueTransactions.map((t) => t.id)
					);
					finalMessage += `\n\nHowever, I'm unsure if they are mostly income ('in') or expenses ('out'). Could you clarify?`;
					conversationStore._updateStatus('Awaiting clarification', 98 /*, taskId */);
				} else {
					conversationStore._updateStatus('Bulk processing complete', 100 /*, taskId */);
				}
			} else {
				finalMessage = `I finished processing the data but couldn't extract any valid transactions.`;
				if (chunkProcessingErrorOccurred) {
					finalMessage += ' There were some errors during processing.';
				}
				finalMessage += ' Please check the format or try providing the data again.';
				conversationStore._updateStatus('No transactions found', 100 /*, taskId */);
			}

			conversationStore._addMessage('assistant', finalMessage);
		} catch (error) {
			console.error(`[BulkTask ${taskId}] Critical error during bulk processing:`, error);
			const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
			conversationStore._addMessage(
				'assistant',
				`Sorry, a critical error occurred during bulk processing: ${errorMsg}`
			);
			conversationStore._updateStatus('Error processing bulk data', 100 /*, taskId */);
		} finally {
			console.log(`[BulkTask ${taskId}] Task finished.`);
			// Clear the background task ID from the store and ensure processing is false
			conversationStore._setBackgroundTaskId(null);
			conversationStore._setProcessing(false);
		}
	};

	// --- Start the background task MANUALLY ---
	// Generate a unique ID for this task instance
	const taskId = uuidv4(); // Or Date.now().toString();

	// Register the task ID with the store so it can be potentially cleared
	// NOTE: The store's _setBackgroundTaskId expects a Timeout ID, using string here.
	// Adapt store or this logic if strict Timeout type is needed for clearing.
	conversationStore._setBackgroundTaskId(taskId as any); // Using 'as any' for simplicity, refine if needed

	// Execute the task asynchronously
	setTimeout(async () => {
		await backgroundTask(taskId);
	}, 0); // Use setTimeout to run after current execution context

	// Return handled: true immediately, background task runs independently.
	return { handled: true };
}
