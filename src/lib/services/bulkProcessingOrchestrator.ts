import { appStore } from '$lib/stores/AppStore';

import { v4 as uuidv4 } from 'uuid';
import { deepseekChat } from './ai/deepseek-client';
import { getSystemPrompt, getExtractionPrompt } from './ai/prompts';
import { parseJsonFromAiResponse, applyExplicitDirection } from '$lib/utils/helpers';
import { llmChunkTransactions } from './ai/conversation/bulk/llm-chunking';
import type { Transaction } from '$lib/stores/types';

export async function processBulkTransactions(
	text: string,
	explicitDirection: 'in' | 'out' | null = null
): Promise<boolean> {
	let didAnyChunkSucceed = false;
	try {
		const chunks = await llmChunkTransactions(text);

		if (!chunks || chunks.length === 0) {
			console.error('[processBulkTransactions] No chunks identified in text');

			return false;
		}

		console.log(`[processBulkTransactions] Identified ${chunks.length} chunks`);

		appStore.initializeBulkChunks(chunks);

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
						appStore.updateBulkChunkStatus(chunkIndex, 'error', 'Failed to parse AI response');
						return;
					}

					const finalTransactions = applyExplicitDirection(
						parsedTransactions.map((txn) => ({ ...txn, id: uuidv4() })),
						explicitDirection
					);

					if (finalTransactions.length > 0) {
						appStore.addTransactions(finalTransactions);
						chunkSucceeded = true;
						didAnyChunkSucceed = true;
					}

					appStore.updateBulkChunkStatus(
						chunkIndex,
						'success',
						`Extracted ${finalTransactions.length} transactions`,
						finalTransactions
					);
				} catch (error) {
					console.error(`[processBulkTransactions] Error processing chunk ${chunkIndex}:`, error);

					appStore.updateBulkChunkStatus(
						chunkIndex,
						'error',
						error instanceof Error ? error.message : 'Unknown processing error'
					);
				}
			});

			await Promise.all(batchPromises);

			if (batchIndex < batchCount - 1) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		}

		console.log(`[processBulkTransactions] Bulk processing flow finished.`);

		return true;
	} catch (error) {
		console.error('[processBulkTransactions] Critical orchestrator error:', error);

		appStore.finalizeBulkProcessing(false);
		return false;
	}
}
