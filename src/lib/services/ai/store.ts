// src/lib/services/ai/store.ts (NEW FILE)
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
let initialPromptSent = false;
let messageInProgress = false;

// Expose state variables to handlers
export const getState = () => ({
	initialPromptSent,
	messageInProgress
});

export const setState = (
	newState: Partial<{
		initialPromptSent: boolean;
		messageInProgress: boolean;
	}>
) => {
	if (newState.initialPromptSent !== undefined) {
		initialPromptSent = newState.initialPromptSent;
	}
	if (newState.messageInProgress !== undefined) {
		messageInProgress = newState.messageInProgress;
	}
};
