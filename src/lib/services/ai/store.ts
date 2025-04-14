// src/lib/services/ai/store.ts
// --------------------------------------
import { writable } from 'svelte/store';
import type { Transaction } from '$lib/types';

// --- Stores ---
export const conversationMessages = writable<{ role: string; content: string }[]>([]);
export const conversationStatus = writable('');
export const isProcessing = writable(false);
export const conversationProgress = writable(0);
export const extractedTransactions = writable<Transaction[]>([]);
export const userMood = writable<'neutral' | 'frustrated' | 'chatty' | 'unknown'>('unknown');

// --- State management ---
// Internal state variables managed by getState/setState
let internalState = {
    initialPromptSent: false,
    messageInProgress: false,
    messageStartTime: 0,
    waitingForDirectionClarification: false,
    clarificationTxnIds: [] as string[], // Store IDs of txns needing clarification (Use string for UUID)
    // --- NEW: Store last input that resulted in extractions ---
    lastInputTextForTransactions: '' as string,
    lastTransactionBatchId: null as string | null // Optional: Group transactions by batch
};


// Expose state variables to handlers via a getter function
export const getState = () => ({ ...internalState }); // Return a copy

// Update state via a setter function
export const setState = (
	newState: Partial<typeof internalState>
) => {
    internalState = { ...internalState, ...newState };
    // Optional: Log state changes for debugging
    // console.log('[AI Store] State updated:', internalState);
};
