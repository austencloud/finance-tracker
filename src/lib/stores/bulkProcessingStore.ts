// src/lib/stores/bulkProcessingStore.ts
import { writable, derived } from 'svelte/store';
import type { Transaction } from '$lib/types/transactionTypes';

export type ChunkStatus = 'pending' | 'processing' | 'success' | 'error';

export interface ProcessingChunk {
	id: string;
	text: string; // First few characters of the chunk
	status: ChunkStatus;
	message: string;
	transactionCount: number;
}

// Stores for tracking bulk processing state
export const processingChunks = writable<ProcessingChunk[]>([]);
export const processingProgress = writable(0);
export const isBulkProcessing = writable(false);
export const tempExtractedTransactions = writable<Transaction[]>([]);

// Statistics derived from the processing state
export const processingStats = derived(
	[processingChunks, tempExtractedTransactions],
	([$chunks, $transactions]) => {
		const successChunks = $chunks.filter((c) => c.status === 'success').length;
		const errorChunks = $chunks.filter((c) => c.status === 'error').length;
		const pendingChunks = $chunks.filter(
			(c) => c.status === 'pending' || c.status === 'processing'
		).length;

		return {
			totalChunks: $chunks.length,
			successChunks,
			errorChunks,
			pendingChunks,
			transactionCount: $transactions.length,
			isComplete: $chunks.length > 0 && pendingChunks === 0
		};
	}
);

// Helper functions to update processing state
export function initializeChunks(chunks: string[]): void {
	const initialChunks: ProcessingChunk[] = chunks.map((chunk, index) => ({
		id: `chunk-${index}`,
		text: chunk.substring(0, 30) + (chunk.length > 30 ? '...' : ''),
		status: 'pending',
		message: '',
		transactionCount: 0
	}));

	processingChunks.set(initialChunks);
	processingProgress.set(0);
	tempExtractedTransactions.set([]);
	isBulkProcessing.set(true);
}

export function updateChunkStatus(
	index: number,
	status: ChunkStatus,
	message: string = '',
	transactions: Transaction[] = []
): void {
	processingChunks.update((chunks) => {
		if (index >= 0 && index < chunks.length) {
			chunks[index] = {
				...chunks[index],
				status,
				message,
				transactionCount: transactions.length
			};
		}
		return chunks;
	});

	// If new transactions, add them to temp store
	if (transactions.length > 0) {
		tempExtractedTransactions.update((txns) => [...txns, ...transactions]);
	}
}

export function updateOverallProgress(percentage: number): void {
	processingProgress.set(Math.min(100, Math.max(0, percentage)));
}

export function finalizeBulkProcessing(success: boolean = true): void {
	isBulkProcessing.set(false);

	// You could also reset all stores here if needed
	if (!success) {
		tempExtractedTransactions.set([]);
	}
}
