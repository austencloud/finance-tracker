import { createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { bulkProcessingStore } from '$lib/stores/bulkProcessingStore';

import { llmChunkTransactions } from '../bulk/llmChunkTransactions';
import { deduplicateTransactions, getCategoryBreakdown } from '../bulk/processing-helpers';
import { parseJsonFromAiResponse, applyExplicitDirection } from '$lib/utils/helpers';
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers';
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants';
import type { Transaction, ChunkStatus } from '$lib/types/types';
import type { HandlerContext } from './types';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { getExtractionPrompt } from '../../prompts/extractionPrompts';
import { getSystemPrompt } from '../../prompts/systemPrompts';

export const bulkDataHandler = createConditionalHandler(
	{
		customCheck: (message) => message.length >= BULK_DATA_THRESHOLD_LENGTH
	},
	async (context) => {
		const { message, explicitDirectionIntent } = context;

		console.log('[BulkDataHandler] Handling bulk transaction data using chunking strategy.');

		conversationStore.addMessage(
			'assistant',
			"That looks like a lot of data! I'll process it in the background. You can monitor the progress below."
		);

		conversationStore.setStatus('Starting bulk processing...', 5);

		backgroundTask(message, explicitDirectionIntent);

		return {
			handled: true,
			response: ''
		};
	}
);

async function backgroundTask(message: string, explicitDirectionIntent: 'in' | 'out' | null) {
	let allExtractedFromThisRun: Transaction[] = [];
	let chunkProcessingErrorOccurred = false;
	const taskId = uuidv4().substring(0, 8);
	let totalChunks = 0;

	try {
		conversationStore.setStatus('AI identifying chunks...', 10);

		const llmChunks = await llmChunkTransactions(message);
		totalChunks = llmChunks.length;

		if (totalChunks === 0) {
			console.warn(`[BulkTask ${taskId}] LLM chunking returned 0 chunks.`);
			conversationStore.addMessage(
				'assistant',
				'The AI could not identify distinct transaction blocks in your text. Please check the format or try again.'
			);
			bulkProcessingStore.finalize();
			return;
		}

		console.log(`[BulkTask ${taskId}] LLM identified ${totalChunks} potential transaction chunks.`);
		llmChunks.forEach((chunk, idx) => {
			console.log(`[BulkTask ${taskId}] Chunk #${idx + 1}/${totalChunks} context:\n${chunk}\n---`);
		});

		bulkProcessingStore.initializeChunks(llmChunks);

		conversationStore.setStatus(`Processing ${totalChunks} chunks...`, 20);

		const PARALLEL_BATCH_SIZE = 5;
		const batchCount = Math.ceil(llmChunks.length / PARALLEL_BATCH_SIZE);

		for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
			const batchStart = batchIndex * PARALLEL_BATCH_SIZE;
			const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, llmChunks.length);
			const currentBatchChunks = llmChunks.slice(batchStart, batchEnd);

			const batchPromises = currentBatchChunks.map(async (chunkText, idx) => {
				const chunkIndex = batchStart + idx;
				let chunkTransactions: Transaction[] = [];
				let chunkErrorMessage = '';
				let chunkStatus: ChunkStatus = 'processing';

				bulkProcessingStore.updateChunkStatus(chunkIndex, 'processing', 'AI extracting...');

				try {
					const today = new Date().toISOString().split('T')[0];
					const extractionPrompt = getExtractionPrompt(chunkText, today);
					const extractionMessages = [
						{ role: 'system' as const, content: getSystemPrompt(today) },
						{ role: 'user' as const, content: extractionPrompt }
					];
					const aiResponse = await llmChat(extractionMessages, {
						temperature: 0.1,
						rawUserText: chunkText,
						requestJsonFormat: true
					});

					// Log the raw AI response for inspection
					console.log(
						`[BulkTask ${taskId}] Chunk ${chunkIndex} Raw AI Response:\n`,
						JSON.stringify(aiResponse, null, 2)
					);

					chunkTransactions = parseTransactionsFromLLMResponse(aiResponse, taskId);

					if (chunkTransactions.length > 0) {
						let finalChunkTransactions = applyExplicitDirection(
							chunkTransactions,
							explicitDirectionIntent
						);
						transactionStore.add(finalChunkTransactions);
						allExtractedFromThisRun.push(...finalChunkTransactions);
						chunkStatus = 'success';
					} else {
						chunkStatus = 'success';
						chunkErrorMessage = 'No transactions found in this chunk.';
					}
				} catch (chunkError) {
					console.error(`[BulkTask ${taskId}] Error processing chunk ${chunkIndex}:`, chunkError);
					chunkProcessingErrorOccurred = true;
					chunkStatus = 'error';
					chunkErrorMessage =
						chunkError instanceof Error ? chunkError.message : 'Unknown processing error';
				} finally {
					bulkProcessingStore.updateChunkStatus(
						chunkIndex,
						chunkStatus,
						chunkErrorMessage,
						chunkTransactions
					);
				}
			});

			await Promise.all(batchPromises);

			if (batchIndex < batchCount - 1) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		conversationStore.setStatus('Finalizing results...', 95);

		const uniqueTransactionsFromThisRun = deduplicateTransactions(allExtractedFromThisRun);
		console.log(
			`[BulkTask ${taskId}] Extracted ${uniqueTransactionsFromThisRun.length} unique transactions in this run.`
		);

		let finalMessage = '';
		if (uniqueTransactionsFromThisRun.length > 0) {
			const categoryBreakdown = getCategoryBreakdown(uniqueTransactionsFromThisRun);
			finalMessage = `Finished processing! Added ${uniqueTransactionsFromThisRun.length} new transaction(s).\n\n${categoryBreakdown}\n\n`;
			if (chunkProcessingErrorOccurred) {
				finalMessage += 'Note: Some parts of your data might have caused errors.\n\n';
			}
			finalMessage += `You can review the updated transaction list now.`;
		} else {
			finalMessage = `I finished processing the data but couldn't extract any valid new transactions.`;
			if (chunkProcessingErrorOccurred) {
				finalMessage += ' There might have been some errors during processing.';
			}
			finalMessage += ' Please check the format or try providing the data again.';
		}

		conversationStore.addMessage('assistant', finalMessage);
		const finalStatus = chunkProcessingErrorOccurred
			? 'Completed with errors'
			: 'Bulk processing complete';
		conversationStore.setStatus(finalStatus, 100);
	} catch (error) {
		console.error(`[BulkTask ${taskId}] Critical error during bulk processing:`, error);
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		conversationStore.addMessage(
			'assistant',
			`Sorry, a critical error occurred during bulk processing: ${errorMsg}`
		);
		conversationStore.setStatus('Error processing bulk data', 100);
		chunkProcessingErrorOccurred = true;
	} finally {
		console.log(`[BulkTask ${taskId}] Background task finished.`);
		conversationStore.setProcessing(false);
		setTimeout(
			() => {
				if (get(bulkProcessingStore).isBulkProcessing) {
					bulkProcessingStore.finalize();
				}
			},
			chunkProcessingErrorOccurred ? 5000 : 3000
		);

		setTimeout(() => {
			const currentState = get(conversationStore);
			if (
				!currentState._internal.waitingForDirectionClarification &&
				currentState.status !== 'Error'
			) {
				conversationStore.setStatus('', 0);
			}
		}, 5000);
	}
}
