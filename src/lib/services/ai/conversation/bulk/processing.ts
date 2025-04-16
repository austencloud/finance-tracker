// src/lib/services/ai/conversation/bulk/processing.ts
import { get } from 'svelte/store';
import { extractTransactionsFromText } from '../../extraction/orchestrator';
import { llmChunkTransactions } from './llm-chunking';
import { deduplicateTransactions, getCategoryBreakdown } from './processing-helpers';
import { v4 as uuidv4 } from 'uuid';

// --- Import AppStore ---
import { appStore } from '$lib/stores/AppStore';

// --- REMOVE old store imports ---
// import {
// 	conversationStatus,
// 	conversationProgress,
// 	extractedTransactions,
// 	setState,
// 	isProcessing,
// 	safeAddAssistantMessage
// } from '../../conversation/conversationDerivedStores';

// --- Keep necessary imports ---
import { isBulkData } from '../conversation-helpers'; // Assuming this is pure utility
import type { Transaction } from '$lib/stores/types';

// --- REMOVE old helper functions ---
// function updateStatus(...) {}
// function updateProgress(...) {}

/**
 * Initiates background processing using appStore.
 */
export async function enhancedBackgroundProcessing(message: string) {
	if (!isBulkData(message)) {
		return { handled: false, response: '' };
	}

	// --- Read processing state from appStore ---
	if (get(appStore).conversation.isProcessing) {
		console.warn('[enhancedBackgroundProcessing] Already processing, ignoring request.');
		// Optionally add message via appStore action
		// appStore.addConversationMessage('assistant', "I'm still working...");
		return {
			handled: true,
			response: "I'm still working on the previous batch. Please wait." // Keep immediate response
		};
	}

	console.log('[enhancedBackgroundProcessing] Starting enhanced processing...');
	// --- Set processing state via appStore action ---
	appStore.setConversationProcessing(true);
	appStore.setConversationStatus('Chunking transaction data...', 5);

	const immediateResponse = `I'll process these transactions in chunks and show you results as they come in. This should be much faster!`;
	// Add the immediate response to the chat via appStore
	appStore.addConversationMessage('assistant', immediateResponse);

	// Start Background Task (setTimeout remains useful for async execution)
	setTimeout(async () => {
		let successfullyAddedTransactions: Transaction[] = []; // Keep track of txns added in this run
		try {
			// --- Step 1: Chunk the data ---
			appStore.setConversationStatus('Identifying transaction chunks...', 10);
			await tick(); // Keep tick if needed for UI updates between stages

			const chunks = await llmChunkTransactions(message);
			if (chunks.length === 0) {
				appStore.addConversationMessage(
					'assistant',
					"I couldn't identify any clear transactions in your text. Could you try a different format?"
				);
				appStore.setConversationProcessing(false); // Reset processing state
				appStore.setConversationStatus('', 0);
				return;
			}

			const totalChunks = chunks.length;
			console.log(`[enhancedBackgroundProcessing] Split data into ${totalChunks} chunks`);
			appStore.setConversationStatus(`Processing ${totalChunks} chunks...`, 15);
			await tick();

			let completedChunks = 0;
			let anyChunkSucceeded = false;

			// --- Step 2: Process chunks ---
			const PARALLEL_BATCH_SIZE = 5;
			const batchCount = Math.ceil(chunks.length / PARALLEL_BATCH_SIZE);

			appStore.addConversationMessage(
				'assistant',
				`Starting to process ${chunks.length} transaction chunks...`
			);

			for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
				const batchStart = batchIndex * PARALLEL_BATCH_SIZE;
				const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, chunks.length);
				const currentBatchChunks = chunks.slice(batchStart, batchEnd);

				const currentProgress = 15 + Math.round((batchIndex / batchCount) * 70);
				appStore.setConversationStatus(
					`Processing batch ${batchIndex + 1}/${batchCount}...`,
					currentProgress
				);

				const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
					try {
						// extractTransactionsFromText should be robust
						const chunkResult = await extractTransactionsFromText(chunk);
						const newTransactions = chunkResult || [];
						if (newTransactions.length > 0) {
							// --- Add directly to appStore ---
							// Note: appStore.addTransactions handles internal deduplication by ID
							// and triggers analysis run
							appStore.addTransactions(newTransactions);
							successfullyAddedTransactions.push(...newTransactions); // Track added ones for final summary
							anyChunkSucceeded = true;
						}
						return newTransactions.length; // Return count for logging if needed
					} catch (error) {
						console.error(
							`[enhancedBackgroundProcessing] Error in chunk ${batchStart + idx}:`,
							error
						);
						return 0; // Return 0 transactions on error
					} finally {
						completedChunks++;
					}
				});

				const results = await Promise.all(batchPromises);
				const transactionsInBatch = results.reduce((sum, count) => sum + count, 0);

				// Update conversation with progress (optional intermediate message)
				if (batchIndex < batchCount - 1) {
					const progressPct = Math.round((completedChunks / totalChunks) * 100);
					if (transactionsInBatch > 0) {
						appStore.addConversationMessage(
							'assistant',
							`Progress update: Found ${transactionsInBatch} more transaction(s) in batch ${batchIndex + 1}. (${progressPct}% complete)`
						);
					} else {
						appStore.addConversationMessage(
							'assistant',
							`Progress update: Processed batch ${batchIndex + 1}. (${progressPct}% complete)`
						);
					}
				}
				await tick();
			}

			// --- Step 3: Finalize results ---
			appStore.setConversationStatus('Finalizing results...', 95);
			await tick();

			// NOTE: Deduplication across batches is handled by appStore.addTransactions's ID check.
			// uniqueTransactions now refers only to the ones *successfully added* in this run.
			const uniqueTransactions = deduplicateTransactions(successfullyAddedTransactions); // Still useful for the summary message

			let finalMessage = '';
			if (uniqueTransactions.length > 0) {
				const categoryBreakdown = getCategoryBreakdown(uniqueTransactions);
				finalMessage =
					`All done! Added ${uniqueTransactions.length} new transaction(s) to your list.\n\n` + // Updated wording
					`${categoryBreakdown}\n\n` +
					`You can see all the transactions now.`;
			} else {
				finalMessage = `I finished processing but couldn't extract any new valid transactions to add. The format might not be recognized or they might be duplicates.`;
			}

			appStore.addConversationMessage('assistant', finalMessage);
		} catch (error) {
			console.error('[enhancedBackgroundProcessing] Unhandled error:', error);
			appStore.addConversationMessage(
				'assistant',
				'Sorry, I ran into a problem while processing your transactions. Please try again.'
			);
			appStore.setConversationStatus('Error');
		} finally {
			// --- Reset processing state via appStore ---
			appStore.setConversationProcessing(false);
			// Keep status as Error if it was set, otherwise clear
			if (get(appStore).conversation.status !== 'Error') {
				appStore.setConversationStatus('', 0);
			}
		}
	}, 50); // Keep setTimeout for async execution off the main thread

	return { handled: true, response: immediateResponse }; // Return success and initial ack message
}

/**
 * Simple utility to wait for the next microtask, allowing UI updates.
 */
async function tick() {
	await new Promise((resolve) => setTimeout(resolve, 10));
}

// REMOVED: resetProcessingState helper function
