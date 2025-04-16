// --- FILENAME: src/lib/services/ai/conversation/handlers/handleBulkData.ts ---

// --- REMOVE old store imports ---

// --- Import Central Store ---
import { appStore } from '$lib/stores/AppStore';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

// AI Client and Prompts
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';

// Constants
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants';

// Bulk Processing Helpers
import { llmChunkTransactions } from '../bulk/llm-chunking';
import { deduplicateTransactions, getCategoryBreakdown } from '../bulk/processing-helpers';
// Removed unused categorizeTransaction import (appStore.addTransactions likely handles categorization implicitly or it happens in parser)
import type { Transaction } from '$lib/stores/types';

// Helper Functions
import { parseJsonFromAiResponse, applyExplicitDirection } from '$lib/utils/helpers';
import { getLLMFallbackResponse, llmChat } from '../../llm';

// --- Main Handler Function ---

/**
 * Handles messages containing bulk transaction data using an LLM chunking strategy.
 * Initiates a background processing task that adds transactions to appStore.
 * Manages conversation state updates via appStore actions.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled (always true if bulk threshold met).
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

	// --- Use appStore actions for initial state updates ---
	// Acknowledge receipt and inform user about background processing
	appStore.addConversationMessage(
		'assistant',
		"That looks like a lot of data! I'll process it in the background and add transactions as they are found. This might take a moment..."
	);
	// Ensure processing state is set (may be redundant if sendMessage did, but safe)
	appStore.setConversationProcessing(true);
	appStore.setConversationStatus('Starting bulk processing...', 5);

	// --- Define the background task ---
	const backgroundTask = async () => {
		let allExtractedFromThisRun: Transaction[] = [];
		let chunkProcessingErrorOccurred = false;
		const batchId = uuidv4(); // Context for this specific extraction run

		try {
			// --- Use appStore actions for status updates ---
			appStore.setConversationStatus('AI identifying chunks...', 10);

			const llmChunks = await llmChunkTransactions(message);
			const totalChunks = llmChunks.length;

			if (totalChunks === 0) {
				console.warn(`[BulkTask ${batchId}] LLM chunking returned 0 chunks.`);
				// --- Use appStore action ---
				appStore.addConversationMessage(
					'assistant',
					'The AI could not identify distinct transaction blocks in your text. Please check the format or try again.'
				);
				// Note: Finally block will handle resetting processing state
				return;
			}

			console.log(
				`[BulkTask ${batchId}] LLM identified ${totalChunks} potential transaction chunks.`
			);
			// --- Use appStore action ---
			appStore.setConversationStatus(`Processing ${totalChunks} identified chunks (0%)...`, 20);

			// --- Process each chunk ---
			const PARALLEL_BATCH_SIZE = 5;
			const batchCount = Math.ceil(llmChunks.length / PARALLEL_BATCH_SIZE);
			for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
				const batchStart = batchIndex * PARALLEL_BATCH_SIZE;
				const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, llmChunks.length);
				const currentBatchChunks = llmChunks.slice(batchStart, batchEnd);

				const progressSoFar = 20 + Math.round((batchStart / totalChunks) * 70);
				// --- Use appStore action ---
				appStore.setConversationStatus(
					`Processing batch ${batchIndex + 1}/${batchCount} (${progressSoFar}%)...`,
					progressSoFar
				);

				const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
					const chunkIndex = batchStart + idx;
					try {
						const today = new Date().toISOString().split('T')[0];
						const extractionPrompt = getExtractionPrompt(chunk, today);
						const extractionMessages = [
							{ role: 'system' as const, content: getSystemPrompt(today) },
							{ role: 'user' as const, content: extractionPrompt }
						];

						const aiResponse = await llmChat(extractionMessages, { temperature: 0.1 });

						// PARSE AND VALIDATE RESPONSE (logic remains the same)
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
								`[BulkTask ${batchId}] Failed to parse valid transaction array from chunk ${chunkIndex}.`
							);
							parsedTransactions = [];
						}

						if (parsedTransactions.length > 0) {
							// Use helpers (logic remains the same)
							let finalChunkTransactions = applyExplicitDirection(
								// Assuming parseTransactionsFromLLMResponse adds IDs or add them here
								// Using orchestration/parser might be cleaner here if they handle ID assignment
								parsedTransactions.map((txn) => ({ ...txn, id: uuidv4() })),
								explicitDirectionIntent
							);

							// *** Add directly to appStore using its action ***
							appStore.addTransactions(finalChunkTransactions);

							// Keep track locally for final summary
							allExtractedFromThisRun.push(...finalChunkTransactions);
						}
					} catch (chunkError) {
						console.error(
							`[BulkTask ${batchId}] Error processing chunk ${chunkIndex}:`,
							chunkError
						);
						chunkProcessingErrorOccurred = true;
					}
				}); // End map

				await Promise.all(batchPromises); // Wait for batch

				// --- Use appStore action for status update ---
				const completedChunks = batchEnd;
				const overallProgress = 20 + Math.round((completedChunks / totalChunks) * 70);
				appStore.setConversationStatus(
					`Processed ${completedChunks}/${totalChunks} chunks (${overallProgress}%)...`,
					overallProgress
				);

				// Optional pause
				if (batchIndex < batchCount - 1) {
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
			} // End for loop (batches)

			// --- Use appStore action for status update ---
			appStore.setConversationStatus('Finalizing results...', 95);

			// Deduplicate and summarize (logic remains the same)
			const uniqueTransactionsFromThisRun = deduplicateTransactions(allExtractedFromThisRun);
			console.log(
				`[BulkTask ${batchId}] Extracted ${uniqueTransactionsFromThisRun.length} unique transactions in this run.`
			);

			let finalMessage = '';
			if (uniqueTransactionsFromThisRun.length > 0) {
				const categoryBreakdown = getCategoryBreakdown(uniqueTransactionsFromThisRun);
				finalMessage = `Finished processing! Added ${uniqueTransactionsFromThisRun.length} new transaction(s).\n\n${categoryBreakdown}\n\n`;
				if (chunkProcessingErrorOccurred) {
					finalMessage +=
						'Note: Some parts of your data might have caused errors during processing.\n\n';
				}
				finalMessage += `You can review the updated transaction list now.`;

				// Check for clarification (logic remains the same)
				const hasIn = uniqueTransactionsFromThisRun.some((t) => t.direction === 'in');
				const hasOut = uniqueTransactionsFromThisRun.some((t) => t.direction === 'out');
				const hasUnknown = uniqueTransactionsFromThisRun.some((t) => t.direction === 'unknown');

				if (!explicitDirectionIntent && hasUnknown && !hasIn && !hasOut) {
					console.log(`[BulkTask ${batchId}] Requesting direction clarification for bulk results.`);
					// --- Use appStore action ---
					appStore.setConversationClarificationNeeded(
						true,
						uniqueTransactionsFromThisRun.map((t) => t.id).filter((id): id is string => !!id) // Ensure IDs are strings
					);
					finalMessage += `\n\nHowever, I'm unsure if they are mostly income ('in') or expenses ('out'). Could you clarify?`;
					// --- Use appStore action ---
					appStore.setConversationStatus('Awaiting clarification', 98);
				} else {
					// --- Use appStore action ---
					appStore.setConversationStatus('Bulk processing complete', 100);
				}
			} else {
				finalMessage = `I finished processing the data but couldn't extract any valid new transactions.`;
				if (chunkProcessingErrorOccurred) {
					finalMessage += ' There might have been some errors during processing.';
				}
				finalMessage += ' Please check the format or try providing the data again.';
				// --- Use appStore action ---
				appStore.setConversationStatus('No new transactions found', 100);
			}

			// --- Use appStore action ---
			appStore.addConversationMessage('assistant', finalMessage);
		} catch (error) {
			// Catch critical errors
			console.error(`[BulkTask ${batchId}] Critical error during bulk processing:`, error);
			const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
			// --- Use appStore actions ---
			appStore.addConversationMessage(
				'assistant',
				`Sorry, a critical error occurred during bulk processing: ${errorMsg}`
			);
			appStore.setConversationStatus('Error processing bulk data', 100); // Use status string directly
		} finally {
			console.log(`[BulkTask ${batchId}] Background task finished.`);
			// --- Use appStore actions and reads for final state reset ---
			appStore.setConversationProcessing(false); // This action should also reset progress if needed

			// Reset status unless waiting for clarification or error occurred
			const currentState = get(appStore).conversation; // Read from appStore
			if (
				!currentState._internal.waitingForDirectionClarification &&
				currentState.status !== 'Error processing bulk data' &&
				currentState.status !== 'Error'
			) {
				appStore.setConversationStatus('', 0);
			}
		}
	}; // End backgroundTask definition

	// --- Start the background task ---
	// Removed setting background task ID in store
	setTimeout(backgroundTask, 50); // Execute task asynchronously

	return { handled: true }; // Indicate bulk data is being handled (async)
}
