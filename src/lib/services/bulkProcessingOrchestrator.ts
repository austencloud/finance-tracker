// src/lib/services/bulkProcessingOrchestrator.ts
import {
	initializeChunks,
	updateChunkStatus,
	updateOverallProgress,
	finalizeBulkProcessing,
	tempExtractedTransactions
} from '$lib/stores/bulkProcessingStore';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { deepseekChat } from './ai/deepseek-client';
import { getSystemPrompt, getExtractionPrompt } from './ai/prompts';
import { parseJsonFromAiResponse, applyExplicitDirection } from '$lib/utils/helpers';
import { llmChunkTransactions } from './ai/conversation/bulk/llm-chunking';
import type { Transaction } from '$lib/types/transactionTypes';

/**
 * Main orchestrator function for bulk transaction processing
 *
 * @param text The raw text input containing transactions
 * @param explicitDirection Optional direction override ('in'/'out')
 * @returns Promise resolving to success status
 */
export async function processBulkTransactions(
	text: string,
	explicitDirection: 'in' | 'out' | null = null
): Promise<boolean> {
	try {
		// Step 1: Chunk the data using LLM
		const chunks = await llmChunkTransactions(text);

		if (!chunks || chunks.length === 0) {
			console.error('[processBulkTransactions] No chunks identified in text');
			return false;
		}

		console.log(`[processBulkTransactions] Identified ${chunks.length} chunks`);

		// Initialize processing UI with chunks
		initializeChunks(chunks);

		// Step 2: Process chunks in parallel batches
		const MAX_CONCURRENT = 5; // Maximum parallel API calls
		const BATCH_SIZE = Math.min(MAX_CONCURRENT, chunks.length);
		const batchCount = Math.ceil(chunks.length / BATCH_SIZE);
		let completedChunks = 0;

		for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
			const batchStart = batchIndex * BATCH_SIZE;
			const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
			const currentBatchChunks = chunks.slice(batchStart, batchEnd);

			// Create batch processing promises
			const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
				const chunkIndex = batchStart + idx;

				try {
					// Update status to processing
					updateChunkStatus(chunkIndex, 'processing', 'Processing...');

					// Extract transactions from this chunk
					const today = new Date().toISOString().split('T')[0];
					const extractionPrompt = getExtractionPrompt(chunk, today);
					const messages = [
						{ role: 'system', content: getSystemPrompt(today) },
						{ role: 'user', content: extractionPrompt }
					];

					// Call the AI API
					const aiResponse = await deepseekChat(messages, { temperature: 0.1 });

					// Parse the JSON response
					const parsedTransactions = parseJsonFromAiResponse<Transaction[]>(aiResponse);

					if (!parsedTransactions || !Array.isArray(parsedTransactions)) {
						updateChunkStatus(chunkIndex, 'error', 'Failed to parse response');
						return [];
					}

					// Apply direction override if specified
					const finalTransactions = applyExplicitDirection(
						parsedTransactions.map((txn) => ({ ...txn, id: uuidv4() })),
						explicitDirection
					);

					// Update success status with transaction count
					updateChunkStatus(
						chunkIndex,
						'success',
						`Extracted ${finalTransactions.length} transactions`,
						finalTransactions
					);

					return finalTransactions;
				} catch (error) {
					console.error(`[processBulkTransactions] Error processing chunk ${chunkIndex}:`, error);
					updateChunkStatus(
						chunkIndex,
						'error',
						error instanceof Error ? error.message : 'Unknown error'
					);
					return [];
				} finally {
					// Update completion status
					completedChunks++;
					updateOverallProgress(Math.floor((completedChunks / chunks.length) * 100));
				}
			});

			// Wait for all chunks in this batch to complete
			await Promise.all(batchPromises);

			// Brief pause between batches to be nice to the API
			if (batchIndex < batchCount - 1) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		}

		// Step 3: Processing complete - check results
		const extractedTransactions = get(tempExtractedTransactions);

		console.log(
			`[processBulkTransactions] Processing complete. Extracted ${extractedTransactions.length} transactions`
		);

		return true;
	} catch (error) {
		console.error('[processBulkTransactions] Critical error:', error);
		finalizeBulkProcessing(false);
		return false;
	}
}
