// src/lib/services/ai/conversation/bulk/processing.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types/transactionTypes';
import { extractTransactionsFromText } from '../../extraction/orchestrator';
// Import the NEW LLM-based chunking function
import { llmChunkTransactions } from './llm-chunking';
// Keep helpers for deduplication and summary
import { deduplicateTransactions, getCategoryBreakdown } from './processing-helpers';

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
function updateStatus(message: string): void {
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
export async function startBackgroundProcessing(
	message: string
): Promise<{ handled: boolean; response: string }> {
	// Double-check if it's bulk data
	if (!isBulkData(message)) {
		return { handled: false, response: '' };
	}

	if (get(isProcessing)) {
		console.warn('[startBackgroundProcessing] Already processing, ignoring request.');
		return { handled: true, response: "I'm still working on the previous request. Please wait." };
	}

	console.log('[startBackgroundProcessing] Starting background processing with LLM chunking...');
	conversationStore._setProcessing(true);

	// Give immediate feedback
	updateStatus('Asking AI to identify transactions...');
	updateProgress(5);

	const immediateResponse = `Okay, I'll ask the AI to identify individual transactions in your statement first, then process them. This might take a moment...`;

	// --- Start Background Task ---
	setTimeout(async () => {
		let processingErrorOccurred = false;
		let allExtractedTxns: Transaction[] = [];

		try {
			updateStatus('AI is identifying transactions (0%)...');
			updateProgress(10);
			await tick();

			// --- Step 1: Get chunks from LLM ---
			const llmChunks = await llmChunkTransactions(message);
			const totalChunks = llmChunks.length;

			if (totalChunks === 0) {
				safeAddAssistantMessage(
					'The AI could not identify distinct transaction blocks in your text. Please check the format.'
				);
				resetProcessingState();
				return;
			}

			console.log(
				`[backgroundProcessing] LLM identified ${totalChunks} potential transaction chunks.`
			);
			updateStatus(`Processing ${totalChunks} identified chunks (0%)...`);
			updateProgress(20); // Progress after successful chunking
			await tick();

			// --- Step 2: Process LLM-generated chunks ---
			for (let i = 0; i < totalChunks; i++) {
				const chunk = llmChunks[i];
				// Update progress: Scale 20% to 90% based on chunk processing
				const progressPercent = 20 + Math.round(((i + 1) / totalChunks) * 70);
				updateStatus(`Processing chunk ${i + 1}/${totalChunks} (${progressPercent}%)...`);
				updateProgress(progressPercent);
				console.log(`[backgroundProcessing] Processing LLM chunk ${i + 1}/${totalChunks}...`);

				try {
					// Call the regular orchestrator for extraction on this specific chunk
					const chunkResult = await extractTransactionsFromText(chunk);
					if (chunkResult && chunkResult.length > 0) {
						allExtractedTxns.push(...chunkResult);
						console.log(
							`[backgroundProcessing] Extracted ${chunkResult.length} txns from chunk ${i + 1}. Total: ${allExtractedTxns.length}`
						);
					} else {
						console.log(`[backgroundProcessing] No txns extracted from chunk ${i + 1}.`);
					}
				} catch (error) {
					console.error(`[backgroundProcessing] Error processing chunk ${i + 1}:`, error);
					processingErrorOccurred = true;
				}
				await tick(); // Allow UI update
			}

			updateStatus('Finalizing results...');
			updateProgress(95);
			await tick();

			// --- Step 3: Deduplicate and Summarize ---
			const uniqueTransactions = deduplicateTransactions(allExtractedTxns);
			console.log(
				`[backgroundProcessing] Deduplicated ${allExtractedTxns.length} -> ${uniqueTransactions.length} transactions.`
			);

			let finalMessage = '';
			if (uniqueTransactions.length > 0) {
				// Use the conversationStore directly
				conversationStore.update((state) => ({
					...state,
					extractedTransactions: [...state.extractedTransactions, ...uniqueTransactions]
				}));

				const categoryBreakdown = getCategoryBreakdown(uniqueTransactions);
				finalMessage =
					`Finished processing! I found ${uniqueTransactions.length} unique transactions.\n\n` +
					`${categoryBreakdown}\n\n`;
				if (processingErrorOccurred) {
					finalMessage += 'Note: Some parts of your data might have caused errors.\n\n';
				}
				finalMessage += `You can see the extracted transactions now. What would you like to do next?`;
			} else {
				finalMessage = `I finished processing the statement but couldn't extract any valid transactions.`;
				if (processingErrorOccurred) {
					finalMessage += ' There were some errors during processing.';
				}
				finalMessage += ' Please check the format or try a different statement.';
			}
			safeAddAssistantMessage(finalMessage);
		} catch (error) {
			console.error('[backgroundProcessing] Unhandled error in background task:', error);
			safeAddAssistantMessage(
				'Sorry, a critical error occurred while processing the statement. Please try again.'
			);
			processingErrorOccurred = true;
		} finally {
			resetProcessingState(processingErrorOccurred);
			setState({ initialPromptSent: true });
		}
	}, 50);

	return { handled: true, response: immediateResponse };
}

/**
 * Resets the processing-related stores.
 * @param errorOccurred If true, sets status to 'Error'.
 */
function resetProcessingState(errorOccurred = false): void {
	updateProgress(0);
	updateStatus(errorOccurred ? 'Error' : '');
	conversationStore._setProcessing(false);
	console.log(`[backgroundProcessing] Reset processing state. Error: ${errorOccurred}`);
}

/**
 * Simple utility to wait for the next microtask, allowing UI updates.
 */
async function tick() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

// Note: processing-helpers.ts would contain deduplicateTransactions and getCategoryBreakdown
// Or you can keep them here if you prefer fewer files.
