// src/lib/services/ai/conversation/bulk-data-handler.ts
import { get } from 'svelte/store';
import { extractTransactionsFromText } from '../extraction';
import {
	conversationStatus,
	conversationProgress,
	extractedTransactions,
	setState
} from '../conversation';
import { isBulkData } from './helpers';
import { BULK_DATA_THRESHOLD_LINES } from './constants';
import type { Transaction } from '$lib/types';

/**
 * Processes bulk data by breaking it into chunks and extracting transactions
 */
export async function processBulkData(
	message: string
): Promise<{ handled: boolean; response: string }> {
	if (!isBulkData(message)) {
		return { handled: false, response: '' };
	}

	console.log('[sendUserMessage] Large input detected, attempting chunk processing...');
	conversationStatus.set('Processing bulk data (0%)...');

	// Split data into manageable chunks
	let chunks = message.split(/\n\s*\n+/).filter((chunk) => chunk.trim().length > 2);
	if (chunks.length <= 5 && message.split('\n').length > BULK_DATA_THRESHOLD_LINES) {
		chunks = message.split('\n').filter((chunk) => chunk.trim().length > 2);
	}

	const totalChunks = chunks.length;
	if (totalChunks === 0) {
		return { handled: false, response: 'No processable data found in your input.' };
	}

	// Process chunks
	let processedChunks = 0;
	const allExtractedTxns: Transaction[] = [];
	let processingErrorOccurred = false;

	console.log(`[sendUserMessage] Starting processing of ${totalChunks} chunks.`);
	for (let i = 0; i < totalChunks; i++) {
		const chunk = chunks[i];
		console.log(`[sendUserMessage] Processing chunk ${i + 1}/${totalChunks}...`);

		try {
			const chunkResult = await extractTransactionsFromText(chunk);
			if (chunkResult && chunkResult.length > 0) {
				allExtractedTxns.push(...chunkResult);
			}
		} catch (error) {
			console.error(`[sendUserMessage] Error processing chunk ${i + 1}/${totalChunks}:`, error);
			processingErrorOccurred = true;
		}

		processedChunks++;
		const progressPercent = Math.round((processedChunks / totalChunks) * 100);
		conversationProgress.set(progressPercent);
		conversationStatus.set(
			`Processing bulk data (${progressPercent}% - ${processedChunks}/${totalChunks})...`
		);
	}

	console.log(`[sendUserMessage] Finished processing ${totalChunks} chunks.`);

	let response = '';
	if (allExtractedTxns.length > 0) {
		extractedTransactions.update((txns) => [...txns, ...allExtractedTxns]);
		response = `Processed ${totalChunks} lines/blocks and successfully extracted ${allExtractedTxns.length} transaction(s).`;
		if (processingErrorOccurred) {
			response += ' Some parts may have caused errors.';
		}
		response += ' You can review them. Anything else?';
	} else {
		response = `I tried processing the ${totalChunks} lines/blocks, but couldn't extract any transactions.`;
		if (processingErrorOccurred) {
			response += ' There were errors.';
		}
		response += ' Try pasting a smaller section.';
	}

	setState({ initialPromptSent: true });
	return { handled: true, response };
}
