import { writable } from 'svelte/store';
import type { BulkProcessingState, ProcessingChunk, ChunkStatus, Transaction } from '../types/types';

const initialBulkProcessingState: BulkProcessingState = {
	processingChunks: [],
	processingProgress: 0,
	isBulkProcessing: false
};

const { subscribe, update, set } = writable<BulkProcessingState>(initialBulkProcessingState);

export const bulkProcessingStore = {
	subscribe,
	initializeChunks: (chunks: string[]) => {
		const initialChunks: ProcessingChunk[] = chunks.map((chunkText, index) => ({
			id: `chunk-${index}`,
			// Store only preview or full text depending on needs
			text: chunkText.substring(0, 75) + (chunkText.length > 75 ? '...' : ''),
			status: 'pending' as ChunkStatus,
			message: '',
			transactionCount: 0
		}));
		
		console.log('[bulkProcessingStore] Initializing chunks:', initialChunks.length);
		
		// Reset state completely when initializing new bulk process
		set({
            processingChunks: initialChunks,
            processingProgress: 0,
            isBulkProcessing: true // This is critical - sets flag that controls UI visibility
        });
        
        console.log('[bulkProcessingStore] Set isBulkProcessing to true');
	},
	updateChunkStatus: (
		chunkIndex: number,
		status: ChunkStatus,
		message: string = '',
		transactions: Transaction[] = [] // Pass transactions to accurately count
	) => {
		update((state) => {
			const chunks = [...state.processingChunks];
			if (chunkIndex >= 0 && chunkIndex < chunks.length) {
				chunks[chunkIndex] = {
					...chunks[chunkIndex],
					status,
					message,
					transactionCount: transactions.length // Count based on actual transactions processed for this chunk
				};
				// Recalculate progress based on completed chunks
				const completed = chunks.filter(c => c.status === 'success' || c.status === 'error').length;
				const progress = chunks.length > 0 ? Math.floor((completed / chunks.length) * 100) : 0;
				return { ...state, processingChunks: chunks, processingProgress: progress };
			}
			return state; // No change if index out of bounds
		});
	},
	finalize: () => {
		console.log('[bulkProcessingStore] Finalizing and resetting state');
		// Reset the bulk processing state completely
		set(initialBulkProcessingState);
	}
};