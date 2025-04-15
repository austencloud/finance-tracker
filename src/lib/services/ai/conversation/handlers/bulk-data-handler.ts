// --- FILENAME: src/lib/services/ai/conversation/handlers/bulk-data-handler.ts ---

import { conversationReadable, conversationStore } from '../conversationStore';
import { appStore } from '$lib/stores/AppStore'; // *** Import appStore ***
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

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

// Helper Functions (assuming parseJsonFromAiResponse, applyExplicitDirection are available, e.g., from utils/helpers)
import { parseJsonFromAiResponse, applyExplicitDirection } from '$lib/utils/helpers';

// --- Main Handler Function ---

/**
 * Handles messages containing bulk transaction data using an LLM chunking strategy.
 * Initiates a background processing task that adds transactions to appStore.
 * Manages conversation state updates via conversationStore.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled (always true if bulk threshold met).
 */
export async function handleBulkData(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean }> {
	// This handler now manages its own flow, doesn't need to return response

	// Condition: Message length exceeds the threshold
	if (message.length < BULK_DATA_THRESHOLD_LENGTH) {
		return { handled: false };
	}

	console.log('[BulkDataHandler] Handling bulk transaction data using chunking strategy.');

	// Acknowledge receipt and inform user about background processing via conversationStore
	conversationStore._addMessage(
		'assistant',
		"That looks like a lot of data! I'll process it in the background and add transactions as they are found. This might take a moment..."
	);
	// Set conversation state to processing (might be redundant if sendMessage already did)
	conversationStore._setProcessing(true);
	conversationStore._updateStatus('Starting bulk processing...', 5);

	// --- Define the background task ---
	// This runs asynchronously without blocking the main thread
	const backgroundTask = async (taskId: string) => {
		let allExtractedFromThisRun: Transaction[] = []; // Keep track of txns from this specific run
		let chunkProcessingErrorOccurred = false;
		const batchId = uuidv4(); // Unique ID for this extraction batch context

		try {
			conversationStore._updateStatus('AI identifying chunks...', 10);

			const llmChunks = await llmChunkTransactions(message);
			const totalChunks = llmChunks.length;

			if (totalChunks === 0) {
				console.warn(`[BulkTask ${taskId}] LLM chunking returned 0 chunks.`);
				conversationStore._addMessage(
					'assistant',
					'The AI could not identify distinct transaction blocks in your text. Please check the format or try again.'
				);
				return; // Exit background task (finally block will reset processing state)
			}

			console.log(
				`[BulkTask ${taskId}] LLM identified ${totalChunks} potential transaction chunks.`
			);
			conversationStore._updateStatus(`Processing ${totalChunks} identified chunks (0%)...`, 20);

			// --- Process each chunk ---
			const PARALLEL_BATCH_SIZE = 5; // Adjust concurrency as needed
			const batchCount = Math.ceil(llmChunks.length / PARALLEL_BATCH_SIZE);
			for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
				const batchStart = batchIndex * PARALLEL_BATCH_SIZE;
				const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, llmChunks.length);
				const currentBatchChunks = llmChunks.slice(batchStart, batchEnd);

				const progressSoFar = 20 + Math.round((batchStart / totalChunks) * 70);
				conversationStore._updateStatus(
					`Processing batch ${batchIndex + 1}/${batchCount} (${progressSoFar}%)...`,
					progressSoFar
				);

				const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
					const chunkIndex = batchStart + idx; // Keep track of original index if needed for UI
					try {
						const today = new Date().toISOString().split('T')[0];
						const extractionPrompt = getExtractionPrompt(chunk, today);
						const extractionMessages = [
							{ role: 'system', content: getSystemPrompt(today) },
							{ role: 'user', content: extractionPrompt }
						];

						const aiResponse = await deepseekChat(extractionMessages, { temperature: 0.1 });

						// --- PARSE AND VALIDATE RESPONSE ---
						let parsedData: unknown = parseJsonFromAiResponse(aiResponse);
						let parsedTransactions: Transaction[];

						if (
							parsedData &&
							typeof parsedData === 'object' &&
							'transactions' in parsedData &&
							Array.isArray(parsedData.transactions)
						) {
							parsedTransactions = parsedData.transactions as Transaction[];
						} else if (Array.isArray(parsedData)) {
							parsedTransactions = parsedData as Transaction[];
						} else {
							console.warn(
								`[BulkTask ${taskId}] Failed to parse valid transaction array from chunk ${chunkIndex}.`
							);
							parsedTransactions = []; // Treat as empty if parse fails
						}
						// --- END PARSE AND VALIDATE ---

						if (parsedTransactions.length > 0) {
							let finalChunkTransactions = applyExplicitDirection(
								parsedTransactions.map((txn) => ({ ...txn, id: uuidv4() })), // Add IDs here
								explicitDirectionIntent
							);
							// *** Add directly to appStore ***
							appStore.addTransactions(finalChunkTransactions);
							// Keep track of transactions added in *this run* for summary/clarification
							allExtractedFromThisRun.push(...finalChunkTransactions);
						}
					} catch (chunkError) {
						console.error(`[BulkTask ${taskId}] Error processing chunk ${chunkIndex}:`, chunkError);
						chunkProcessingErrorOccurred = true;
					}
				}); // End map

				await Promise.all(batchPromises); // Wait for batch to complete

				// Update overall progress after batch
				const completedChunks = batchEnd;
				const overallProgress = 20 + Math.round((completedChunks / totalChunks) * 70);
				conversationStore._updateStatus(
					`Processed ${completedChunks}/${totalChunks} chunks (${overallProgress}%)...`,
					overallProgress
				);

				// Optional: Brief pause between batches
				if (batchIndex < batchCount - 1) {
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
			} // End for loop (batches)

			conversationStore._updateStatus('Finalizing results...', 95);

			// --- Step 3: Deduplicate (optional, addTransactions handles ID conflicts) & Summarize ---
			// Deduplication might be less critical now if addTransactions checks IDs,
			// but still useful if the *same run* extracts identical data from different chunks.
			const uniqueTransactionsFromThisRun = deduplicateTransactions(allExtractedFromThisRun);
			console.log(
				`[BulkTask ${taskId}] Extracted ${uniqueTransactionsFromThisRun.length} unique transactions in this run.`
			);

			let finalMessage = '';
			if (uniqueTransactionsFromThisRun.length > 0) {
				// *** REMOVED call to _appendExtractedTransactions ***

				const categoryBreakdown = getCategoryBreakdown(uniqueTransactionsFromThisRun); // Summarize only what was just added
				finalMessage = `Finished processing! Added ${uniqueTransactionsFromThisRun.length} new transaction(s).\n\n${categoryBreakdown}\n\n`;
				if (chunkProcessingErrorOccurred) {
					finalMessage +=
						'Note: Some parts of your data might have caused errors during processing.\n\n';
				}
				finalMessage += `You can review the updated transaction list now.`;

				// Optional: Check for Direction Clarification for *this batch*
				const hasIn = uniqueTransactionsFromThisRun.some((t) => t.direction === 'in');
				const hasOut = uniqueTransactionsFromThisRun.some((t) => t.direction === 'out');
				const hasUnknown = uniqueTransactionsFromThisRun.some((t) => t.direction === 'unknown');

				if (!explicitDirectionIntent && hasUnknown && !hasIn && !hasOut) {
					// Only ask if all are unknown
					console.log(`[BulkTask ${taskId}] Requesting direction clarification for bulk results.`);
					conversationStore._setClarificationNeeded(
						true,
						uniqueTransactionsFromThisRun.map((t) => t.id) // Get IDs from this run's transactions
					);
					finalMessage += `\n\nHowever, I'm unsure if they are mostly income ('in') or expenses ('out'). Could you clarify?`;
					conversationStore._updateStatus('Awaiting clarification', 98);
				} else {
					conversationStore._updateStatus('Bulk processing complete', 100);
				}
			} else {
				finalMessage = `I finished processing the data but couldn't extract any valid new transactions.`;
				if (chunkProcessingErrorOccurred) {
					finalMessage += ' There might have been some errors during processing.';
				}
				finalMessage += ' Please check the format or try providing the data again.';
				conversationStore._updateStatus('No new transactions found', 100);
			}

			conversationStore._addMessage('assistant', finalMessage);
		} catch (error) {
			// Catch critical errors in the orchestrator itself
			console.error(`[BulkTask ${taskId}] Critical error during bulk processing:`, error);
			const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
			conversationStore._addMessage(
				'assistant',
				`Sorry, a critical error occurred during bulk processing: ${errorMsg}`
			);
			conversationStore._updateStatus('Error processing bulk data', 100);
		} finally {
			console.log(`[BulkTask ${taskId}] Background task finished.`);
			// Ensure processing state is reset in conversationStore
			conversationStore._setBackgroundTaskId(null); // Clear task ID
			conversationStore._setProcessing(false); // Set processing to false
			// Reset status and progress unless waiting for clarification
			const currentState = conversationStore._getInternalState();
			if (
				!currentState.waitingForDirectionClarification &&
				get(conversationReadable).status !== 'Error'
			) {
				conversationStore._updateStatus('', 0);
			}
		}
	}; // End backgroundTask definition

	// --- Start the background task ---
	const taskId = uuidv4();
	conversationStore._setBackgroundTaskId(taskId as any); // Register task ID (cast needed)
	// Execute task asynchronously
	setTimeout(() => {
		backgroundTask(taskId);
	}, 50); // Short delay to allow UI update

	// Return handled: true immediately; background task runs independently.
	return { handled: true };
}
