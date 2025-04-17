// src/lib/services/bulkProcessingOrchestrator.ts

import { appStore } from '$lib/stores/AppStore';
import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from '$lib/types/types';

// --- UPDATED IMPORT: Use abstraction layer ---
import { llmChat } from './ai/llm-helpers';
// --- END UPDATE ---

// Import prompts and helpers (remain the same)
import { getSystemPrompt, getExtractionPrompt } from './ai/prompts';
import { parseJsonFromAiResponse, applyExplicitDirection } from '$lib/utils/helpers';
import { llmChunkTransactions } from './ai/conversation/bulk/llmChunkTransactions'; // Note: llmChunkTransactions itself needs internal refactoring if it calls LLM

/**
 * Processes large text inputs by chunking them and extracting transactions in batches.
 * Uses the configured LLM backend via the abstraction layer.
 *
 * @param text - The large input text containing multiple transactions.
 * @param explicitDirection - Optional direction ('in' | 'out') to apply to all extracted transactions.
 * @returns Promise resolving to true if processing initiated successfully, false otherwise.
 */
export async function processBulkTransactions(
	text: string,
	explicitDirection: 'in' | 'out' | null = null
): Promise<boolean> {
	let didAnyChunkSucceed = false; // Keep track if at least one chunk worked
	try {
		// Chunk the text using the llmChunkTransactions service
		// Note: llmChunkTransactions must also be updated internally if it uses an LLM
		const chunks = await llmChunkTransactions(text);

		if (!chunks || chunks.length === 0) {
			console.error(
				'[processBulkTransactions] No chunks identified in text by llmChunkTransactions.'
			);
			// Consider adding a user-facing message via appStore here
			return false; // Indicate failure
		}

		console.log(`[processBulkTransactions] Identified ${chunks.length} chunks.`);

		// Initialize the UI state for bulk processing
		appStore.initializeBulkChunks(chunks);

		// Define concurrency limits
		const MAX_CONCURRENT = 5; // Process up to 5 chunks concurrently
		const BATCH_SIZE = Math.min(MAX_CONCURRENT, chunks.length);
		const batchCount = Math.ceil(chunks.length / BATCH_SIZE);

		// Process chunks in batches
		for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
			const batchStart = batchIndex * BATCH_SIZE;
			const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
			const currentBatchChunks = chunks.slice(batchStart, batchEnd);

			console.log(
				`[processBulkTransactions] Processing chunk batch ${batchIndex + 1}/${batchCount}...`
			);

			// Create promises for each chunk in the current batch
			const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
				const chunkIndex = batchStart + idx; // Overall index of the chunk

				try {
					// Update UI status for the chunk
					appStore.updateBulkChunkStatus(chunkIndex, 'processing', 'Sending to AI...');

					// Prepare prompt and messages for the LLM
					const today = new Date().toISOString().split('T')[0];
					const extractionPrompt = getExtractionPrompt(chunk, today); // Use standard extraction prompt
					const messages = [
						{ role: 'system' as const, content: getSystemPrompt(today) }, // Use 'as const' for literal type
						{ role: 'user' as const, content: extractionPrompt }
					];

					// --- UPDATED CALL: Use abstracted LLM function ---
					// Use llmChat as the extraction prompt doesn't necessarily guarantee JSON,
					// although we hope it produces it. Parsing handles validation.
					const aiResponse = await llmChat(messages, { temperature: 0.1, rawUserText: chunk });
					// --- END UPDATE ---

					// Attempt to parse the AI response as JSON containing transactions
					appStore.updateBulkChunkStatus(chunkIndex, 'processing', 'Parsing response...');
					const parsedTransactions = parseJsonFromAiResponse<Transaction[]>(aiResponse);

					// Validate parsing result
					if (!parsedTransactions || !Array.isArray(parsedTransactions)) {
						console.warn(
							`[processBulkTransactions] Chunk ${chunkIndex}: Failed to parse valid transaction array from AI response.`
						);
						// Check if it was likely text
						if (
							aiResponse &&
							typeof aiResponse === 'string' &&
							!aiResponse.trim().startsWith('{') &&
							!aiResponse.trim().startsWith('[')
						) {
							appStore.updateBulkChunkStatus(
								chunkIndex,
								'error',
								'AI returned text, not structured data.'
							);
						} else {
							appStore.updateBulkChunkStatus(
								chunkIndex,
								'error',
								'Failed to parse AI response structure.'
							);
						}
						return; // Stop processing this chunk on parse failure
					}

					// Process valid, parsed transactions
					// Assign unique IDs and apply explicit direction if provided
					const finalTransactions = applyExplicitDirection(
						parsedTransactions.map((txn) => ({
							...txn,
							id: txn.id || uuidv4(), // Ensure ID exists
							batchId: `bulk-${chunkIndex}-${uuidv4().substring(0, 4)}` // Add specific batch/chunk ID
						})),
						explicitDirection
					);

					// Add successfully extracted transactions to the store
					if (finalTransactions.length > 0) {
						appStore.transactions.add(finalTransactions);
						didAnyChunkSucceed = true; // Mark that at least one chunk succeeded
					}

					// Update chunk status to success
					appStore.updateBulkChunkStatus(
						chunkIndex,
						'success',
						`Extracted ${finalTransactions.length} transaction(s)`,
						finalTransactions // Pass transactions to potentially update count in UI state
					);
				} catch (error) {
					// Handle errors during processing of a single chunk
					console.error(`[processBulkTransactions] Error processing chunk ${chunkIndex}:`, error);
					// Update chunk status to error
					appStore.updateBulkChunkStatus(
						chunkIndex,
						'error',
						error instanceof Error ? error.message : 'Unknown processing error'
					);
					// Continue processing other chunks in the batch
				}
			}); // End map for batchPromises

			// Wait for all promises in the current batch to settle
			await Promise.all(batchPromises);

			// Optional delay between batches to avoid overwhelming APIs or local resources
			if (batchIndex < batchCount - 1) {
				await new Promise((resolve) => setTimeout(resolve, 300)); // 300ms pause
			}
		} // End for loop (batches)

		console.log(`[processBulkTransactions] Bulk processing flow finished.`);
		// Return true even if some chunks failed, as the process completed
		return true; // Indicate processing finished (success depends on individual chunks)
	} catch (error) {
		// Handle critical errors in the orchestrator itself (e.g., chunking failure)
		console.error('[processBulkTransactions] Critical orchestrator error:', error);
		// Ensure bulk processing UI state is cleaned up
		appStore.conversation.finalizeBulkProcessing(false); // Indicate failure
		return false; // Indicate failure
	}
	// Note: conversation.finalizeBulkProcessing is called by the UI component when the user clicks "Done"
}
