import { get } from 'svelte/store';
import { extractTransactionsFromText } from '../../extraction/orchestrator';
import { llmChunkTransactions } from './llmChunkTransactions';
import { deduplicateTransactions, getCategoryBreakdown } from './processing-helpers';
import { v4 as uuidv4 } from 'uuid';
import { conversationStore } from '$lib/stores/conversationStore';
import { isBulkData } from '../conversation-helpers';
import type { Transaction } from '$lib/types/types';

// You must provide a way to add transactions to your main transaction store elsewhere
// import { transactionsStore } from '...';

export async function enhancedBackgroundProcessing(message: string) {
	if (!isBulkData(message)) {
		return { handled: false, response: '' };
	}

	if (get(conversationStore).isProcessing) {
		console.warn('[enhancedBackgroundProcessing] Already processing, ignoring request.');
		return {
			handled: true,
			response: "I'm still working on the previous batch. Please wait."
		};
	}

	conversationStore.setProcessing(true);
	conversationStore.setStatus('Chunking transaction data...', 5);

	const immediateResponse = `I'll process these transactions in chunks and show you results as they come in. This should be much faster!`;
	conversationStore.addMessage('assistant', immediateResponse);

	setTimeout(async () => {
		let successfullyAddedTransactions: Transaction[] = [];
		try {
			conversationStore.setStatus('Identifying transaction chunks...', 10);
			await tick();

			const chunks = await llmChunkTransactions(message);
			if (chunks.length === 0) {
				conversationStore.addMessage(
					'assistant',
					"I couldn't identify any clear transactions in your text. Could you try a different format?"
				);
				conversationStore.setProcessing(false);
				conversationStore.setStatus('', 0);
				return;
			}

			const totalChunks = chunks.length;
			conversationStore.setStatus(`Processing ${totalChunks} chunks...`, 15);
			await tick();

			let completedChunks = 0;
			let anyChunkSucceeded = false;
			const PARALLEL_BATCH_SIZE = 5;
			const batchCount = Math.ceil(chunks.length / PARALLEL_BATCH_SIZE);

			conversationStore.addMessage(
				'assistant',
				`Starting to process ${chunks.length} transaction chunks...`
			);

			for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
				const batchStart = batchIndex * PARALLEL_BATCH_SIZE;
				const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, chunks.length);
				const currentBatchChunks = chunks.slice(batchStart, batchEnd);

				const currentProgress = 15 + Math.round((batchIndex / batchCount) * 70);
				conversationStore.setStatus(
					`Processing batch ${batchIndex + 1}/${batchCount}...`,
					currentProgress
				);

				const batchPromises = currentBatchChunks.map(async (chunk, idx) => {
					try {
						const chunkResult = await extractTransactionsFromText(chunk);
						const newTransactions = chunkResult || [];
						if (newTransactions.length > 0) {
							// You must add these transactions to your main transaction store here
							// transactionsStore.add(newTransactions);
							successfullyAddedTransactions.push(...newTransactions);
							anyChunkSucceeded = true;
						}
						return newTransactions.length;
					} catch (error) {
						console.error(
							`[enhancedBackgroundProcessing] Error in chunk ${batchStart + idx}:`,
							error
						);
						return 0;
					} finally {
						completedChunks++;
					}
				});

				const results = await Promise.all(batchPromises);
				const transactionsInBatch = results.reduce((sum, count) => sum + count, 0);

				if (batchIndex < batchCount - 1) {
					const progressPct = Math.round((completedChunks / totalChunks) * 100);
					if (transactionsInBatch > 0) {
						conversationStore.addMessage(
							'assistant',
							`Progress update: Found ${transactionsInBatch} more transaction(s) in batch ${batchIndex + 1}. (${progressPct}% complete)`
						);
					} else {
						conversationStore.addMessage(
							'assistant',
							`Progress update: Processed batch ${batchIndex + 1}. (${progressPct}% complete)`
						);
					}
				}
				await tick();
			}

			conversationStore.setStatus('Finalizing results...', 95);
			await tick();

			const uniqueTransactions = deduplicateTransactions(successfullyAddedTransactions);

			let finalMessage = '';
			if (uniqueTransactions.length > 0) {
				const categoryBreakdown = getCategoryBreakdown(uniqueTransactions);
				finalMessage =
					`All done! Added ${uniqueTransactions.length} new transaction(s) to your list.\n\n` +
					`${categoryBreakdown}\n\n` +
					`You can see all the transactions now.`;
			} else {
				finalMessage = `I finished processing but couldn't extract any new valid transactions to add. The format might not be recognized or they might be duplicates.`;
			}

			conversationStore.addMessage('assistant', finalMessage);
		} catch (error) {
			console.error('[enhancedBackgroundProcessing] Unhandled error:', error);
			conversationStore.addMessage(
				'assistant',
				'Sorry, I ran into a problem while processing your transactions. Please try again.'
			);
			conversationStore.setStatus('Error');
		} finally {
			conversationStore.setProcessing(false);
			if (get(conversationStore).status !== 'Error') {
				conversationStore.setStatus('', 0);
			}
		}
	}, 50);

	return { handled: true, response: immediateResponse };
}

async function tick() {
	await new Promise((resolve) => setTimeout(resolve, 10));
}
