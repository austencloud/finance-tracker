// src/lib/services/ai/conversation/bulk/processing.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types/transactionTypes';
import { extractTransactionsFromText } from '../../extraction/orchestrator';
// Import the NEW LLM-based chunking function
import { llmChunkTransactions } from './llm-chunking';
// Keep helpers for deduplication and summary
import { deduplicateTransactions, getCategoryBreakdown } from './processing-helpers';
import { v4 as uuidv4 } from 'uuid';

// Import from derived stores now
import {
	conversationStatus,
	conversationProgress,
	extractedTransactions,
	setState,
	isProcessing,
	safeAddAssistantMessage
} from '../../conversation/conversationDerivedStores';

import { isBulkData } from '../conversation-helpers';
import { conversationStore } from '../conversationStore';

// Helper function to safely update store (avoiding type errors)
function updateStatus(message: string, p0: number): void {
	// @ts-ignore - Ignoring TypeScript errors here as we know this is the correct way to update the store
	conversationStatus.set(message);
}

// Helper function to safely update progress (avoiding type errors)
function updateProgress(value: number): void {
	// @ts-ignore - Ignoring TypeScript errors here as we know this is the correct way to update the store
	conversationProgress.set(value);
}

/**
 * Initiates background processing for large text inputs using LLM for chunking.
 * Provides immediate feedback and processes data in chunks.
 *
 * @param message The user's input message.
 * @returns Object indicating if handled and an immediate response message.
 */

export async function enhancedBackgroundProcessing(message: string) {
	if (!isBulkData(message)) {
		return { handled: false, response: '' };
	}

	if (get(isProcessing)) {
		console.warn('[enhancedBackgroundProcessing] Already processing, ignoring request.');
		return {
			handled: true,
			response: "I'm still working on the previous batch. Please wait."
		};
	}

	console.log('[enhancedBackgroundProcessing] Starting enhanced processing...');
	conversationStore._setProcessing(true);

	// Give immediate feedback
	updateStatus('Chunking transaction data...', 5);

	const immediateResponse = `I'll process these transactions in chunks and show you results as they come in. This should be much faster!`;

	// Start Background Task
	setTimeout(async () => {
		try {
			// --- Step 1: Chunk the data ---
			updateStatus('Identifying transaction chunks...', 10);
			await tick();

			const chunks = await llmChunkTransactions(message);
			if (chunks.length === 0) {
				safeAddAssistantMessage(
					"I couldn't identify any clear transactions in your text. Could you try a different format?"
				);
				resetProcessingState();
				return;
			}

			const totalChunks = chunks.length;
			console.log(`[enhancedBackgroundProcessing] Split data into ${totalChunks} chunks`);
			updateStatus(`Processing ${totalChunks} chunks in parallel...`, 15);
			await tick();

			let allExtractedTxns = [];
			let completedChunks = 0;

			// --- Step 2: Process chunks in batches of 5 (or adjust based on your API limits) ---
			const PARALLEL_BATCH_SIZE = 5;
			const batchCount = Math.ceil(chunks.length / PARALLEL_BATCH_SIZE);

			// Show the first transaction as soon as possible
			safeAddAssistantMessage(
				`Starting to process ${chunks.length} transaction chunks. I'll update you as I go...`
			);

			for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
				const batchStart = batchIndex * PARALLEL_BATCH_SIZE;
				const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, chunks.length);
				const currentBatchChunks = chunks.slice(batchStart, batchEnd);

				updateStatus(
					`Processing batch ${batchIndex + 1}/${batchCount}...`,
					15 + Math.round((batchIndex / batchCount) * 70)
				);

				// Create an array of promises for parallel processing
				const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
					try {
						// Use your existing extraction function
						const chunkResult = await extractTransactionsFromText(chunk);
						return chunkResult || [];
					} catch (error) {
						console.error(
							`[enhancedBackgroundProcessing] Error in chunk ${batchStart + idx}:`,
							error
						);
						return []; // Return empty array on error
					}
				});

				// Wait for all chunks in this batch to complete
				const batchResults = await Promise.all(batchPromises);

				// Process results from this batch
				let newTransactions: Transaction[] = [];
				batchResults.forEach((chunkTxns) => {
					if (chunkTxns.length > 0) {
						newTransactions.push(...chunkTxns);
					}
					completedChunks++;
				});

				// Stream results as soon as we have them
				if (newTransactions.length > 0) {
					allExtractedTxns.push(...newTransactions);

					// Update the UI with current transactions
					// Use _appendExtractedTransactions to add without replacing existing ones
					conversationStore._appendExtractedTransactions(
						newTransactions,
						`batch-${batchIndex}`,
						uuidv4()
					);

					// If this isn't the final batch, give the user an update
					if (batchIndex < batchCount - 1) {
						const progressPct = Math.round((completedChunks / totalChunks) * 100);
						safeAddAssistantMessage(
							`Progress update: Extracted ${allExtractedTxns.length} transactions so far (${progressPct}% complete). Processing more chunks...`
						);
					}
				}

				// Let the UI breathe between batches
				await tick();
			}

			// --- Step 3: Finalize results ---
			updateStatus('Finalizing results...', 95);
			await tick();

			// Deduplicate across all batches
			const uniqueTransactions = deduplicateTransactions(allExtractedTxns);

			let finalMessage = '';
			if (uniqueTransactions.length > 0) {
				const categoryBreakdown = getCategoryBreakdown(uniqueTransactions);
				finalMessage =
					`All done! Extracted a total of ${uniqueTransactions.length} unique transactions.\n\n` +
					`${categoryBreakdown}\n\n` +
					`You can see all the transactions now. Need any help with categorizing them?`;
			} else {
				finalMessage = `I finished processing but couldn't extract any valid transactions. The format might not be recognized.`;
			}

			safeAddAssistantMessage(finalMessage);
		} catch (error) {
			console.error('[enhancedBackgroundProcessing] Unhandled error:', error);
			safeAddAssistantMessage(
				'Sorry, I ran into a problem while processing your transactions. Please try again with a smaller batch.'
			);
		} finally {
			resetProcessingState();
		}
	}, 50);

	return { handled: true, response: immediateResponse };
}

/**
 * Simple utility to wait for the next microtask, allowing UI updates.
 */
async function tick() {
	await new Promise((resolve) => setTimeout(resolve, 10));
}

/**
 * Resets the processing-related stores.
 */
function resetProcessingState() {
	updateProgress(0);
	updateStatus('', 0);
	conversationStore._setProcessing(false);
}

/**
 * Resets the processing-related stores.
 * @param errorOccurred If true, sets status to 'Error'.
 */

/**
 * Simple utility to wait for the next microtask, allowing UI updates.
 */

// Note: processing-helpers.ts would contain deduplicateTransactions and getCategoryBreakdown
// Or you can keep them here if you prefer fewer files.
