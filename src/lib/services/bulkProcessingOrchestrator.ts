// src/lib/services/bulkProcessingOrchestrator.ts

// --- Import appStore ---
import { appStore } from '$lib/stores/AppStore';
// --- Remove old store imports ---
// import {
//  initializeChunks,
//  updateChunkStatus,
//  updateOverallProgress,
//  finalizeBulkProcessing,
//  tempExtractedTransactions
// } from '$lib/stores/bulkProcessingStore';
// import { get } from 'svelte/store'; // get might not be needed here anymore

// --- Keep other necessary imports ---
import { v4 as uuidv4 } from 'uuid';
import { deepseekChat } from './ai/deepseek-client'; // Assuming path is correct
import { getSystemPrompt, getExtractionPrompt } from './ai/prompts'; // Assuming path is correct
import { parseJsonFromAiResponse, applyExplicitDirection } from '$lib/utils/helpers'; // Assuming path is correct
import { llmChunkTransactions } from './ai/conversation/bulk/llm-chunking'; // Assuming path is correct
import type { Transaction } from '$lib/stores/types'; // Assuming path is correct

/**
 * Main orchestrator function for bulk transaction processing using appStore
 *
 * @param text The raw text input containing transactions
 * @param explicitDirection Optional direction override ('in'/'out')
 * @returns Promise resolving to success status (true if process completed without critical errors)
 */
export async function processBulkTransactions(
	text: string,
	explicitDirection: 'in' | 'out' | null = null
): Promise<boolean> {
	let didAnyChunkSucceed = false;
	try {
		// Step 1: Chunk the data using LLM
		const chunks = await llmChunkTransactions(text);

		if (!chunks || chunks.length === 0) {
			console.error('[processBulkTransactions] No chunks identified in text');
			// Optional: Could call appStore.finalizeBulkProcessing(false) here if UI was initiated
			return false;
		}

		console.log(`[processBulkTransactions] Identified ${chunks.length} chunks`);

		// Initialize processing UI via appStore action
		appStore.initializeBulkChunks(chunks);

		// Step 2: Process chunks in parallel batches
		const MAX_CONCURRENT = 5;
		const BATCH_SIZE = Math.min(MAX_CONCURRENT, chunks.length);
		const batchCount = Math.ceil(chunks.length / BATCH_SIZE);

		for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
			const batchStart = batchIndex * BATCH_SIZE;
			const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
			const currentBatchChunks = chunks.slice(batchStart, batchEnd);

			console.log(`Processing batch ${batchIndex + 1}/${batchCount}...`);

			const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
				const chunkIndex = batchStart + idx;
				let chunkSucceeded = false;

				try {
					// Update chunk status to processing via appStore action
					appStore.updateBulkChunkStatus(chunkIndex, 'processing', 'Processing...');

					const today = new Date().toISOString().split('T')[0];
					const extractionPrompt = getExtractionPrompt(chunk, today);
					const messages = [
						{ role: 'system', content: getSystemPrompt(today) },
						{ role: 'user', content: extractionPrompt }
					];

					const aiResponse = await deepseekChat(messages, { temperature: 0.1 });
					const parsedTransactions = parseJsonFromAiResponse<Transaction[]>(aiResponse);

					if (!parsedTransactions || !Array.isArray(parsedTransactions)) {
						// Update chunk status to error via appStore action
						appStore.updateBulkChunkStatus(chunkIndex, 'error', 'Failed to parse AI response');
						return; // Don't proceed for this chunk
					}

					const finalTransactions = applyExplicitDirection(
						parsedTransactions.map((txn) => ({ ...txn, id: uuidv4() })), // Ensure unique IDs
						explicitDirection
					);

					if (finalTransactions.length > 0) {
						// --- Add transactions directly to the main store ---
						appStore.addTransactions(finalTransactions);
						chunkSucceeded = true; // Mark that we found something in this chunk
						didAnyChunkSucceed = true; // Mark overall success
					}

					// Update chunk status to success via appStore action
					appStore.updateBulkChunkStatus(
						chunkIndex,
						'success',
						`Extracted ${finalTransactions.length} transactions`,
						finalTransactions // Pass for transactionCount in UI state
					);
				} catch (error) {
					console.error(`[processBulkTransactions] Error processing chunk ${chunkIndex}:`, error);
					// Update chunk status to error via appStore action
					appStore.updateBulkChunkStatus(
						chunkIndex,
						'error',
						error instanceof Error ? error.message : 'Unknown processing error'
					);
				}
				// Progress is updated internally within updateBulkChunkStatus now
			});

			// Wait for all chunks in this batch to complete
			await Promise.all(batchPromises);

			// Optional: Trigger analysis update after each batch if desired
			// if (didAnyChunkSucceedInBatch) { // Requires tracking success within the batch
			//  appStore.runFinancialAnalysis();
			// }

			// Brief pause between batches
			if (batchIndex < batchCount - 1) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		}

		// Step 3: Processing complete
		// No need to read tempExtractedTransactions - they are already in the main store.
		console.log(`[processBulkTransactions] Bulk processing flow finished.`);

		// Trigger final analysis update if any chunks were successful
		// if (didAnyChunkSucceed) {
		// 	console.log("Triggering final analysis run after bulk processing.");
		// 	// appStore.runFinancialAnalysis(); // Uncomment when analysis action exists
		// }

		// The BulkProcessingUI component will see processingStats.isComplete change
		// and show the "Add Transactions" button (which now just closes the UI)
		// or the user can click "Cancel" which calls finalizeBulkProcessing(false)

		return true; // Indicate the orchestration process itself completed
	} catch (error) {
		console.error('[processBulkTransactions] Critical orchestrator error:', error);
		// Finalize processing state (clears UI) via appStore action
		appStore.finalizeBulkProcessing(false); // Pass false as it failed critically
		return false;
	}
}
