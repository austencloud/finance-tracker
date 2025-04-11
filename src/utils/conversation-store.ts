// src/utils/conversation.store.ts
import { writable } from 'svelte/store';
import type { Transaction } from '../types';

/** Indicates if the AI chat interface/mode is active */
export const conversationActive = writable(false);

/** Stores the history of messages in the current conversation */
export const conversationMessages = writable<{ role: string; content: string }[]>([]);

/** Represents the progress percentage of a background task (0-100) */
export const conversationProgress = writable(0);

/** Holds transactions extracted during the conversation */
export const extractedTransactions = writable<Transaction[]>([]);

/** Displays status messages related to conversation actions (e.g., "Thinking...") */
export const conversationStatus = writable('');

/** Tracks if an LLM request or processing task is currently running */
export const isProcessing = writable(false);

/** Tracks if the initial user prompt has been sent in the current session */
export const initialPromptSent = writable(false); // Renamed from internal variable
