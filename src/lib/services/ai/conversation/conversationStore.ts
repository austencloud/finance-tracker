// src/lib/services/ai/conversation/conversationStore.ts
import type { Transaction } from '$lib/stores/types'; // Ensure correct path to types
import { writable, get, type Writable, type Readable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number;
}

export type UserMood = 'neutral' | 'frustrated' | 'chatty' | 'unknown';

// Define the state structure including the new fields for duplicate confirmation
export interface ConversationState {
	messages: ConversationMessage[];
	status: string;
	isProcessing: boolean;
	progress: number;
	// REMOVED: extractedTransactions: Transaction[]; // Transactions are now in appStore
	userMood: UserMood;
	_internal: {
		initialPromptSent: boolean;
		messageLock: boolean; // Prevents rapid-fire assistant messages
		backgroundTaskId: ReturnType<typeof setTimeout> | null; // ID for potential background tasks
		waitingForDirectionClarification: boolean;
		clarificationTxnIds: string[];
		lastUserMessageText: string; // Context for corrections
		lastExtractionBatchId: string | null; // Context for corrections
		// --- NEW STATE for Duplicate Handling ---
		waitingForDuplicateConfirmation: boolean;
		pendingDuplicateTransactions: Transaction[];
		// --- END NEW STATE ---
	};
}

// Define the initial state including the new fields
const initialState: ConversationState = {
	messages: [],
	status: '',
	isProcessing: false,
	progress: 0,
	// extractedTransactions: [], // REMOVED
	userMood: 'unknown',
	_internal: {
		initialPromptSent: false,
		messageLock: false,
		backgroundTaskId: null,
		waitingForDirectionClarification: false,
		clarificationTxnIds: [],
		lastUserMessageText: '',
		lastExtractionBatchId: null,
		// --- NEW STATE ---
		waitingForDuplicateConfirmation: false,
		pendingDuplicateTransactions: [],
		// --- END NEW STATE ---
	}
};

// Factory function to create the store instance
function createInternalConversationStore() {
	const store: Writable<ConversationState> = writable(initialState);
	const { subscribe, update, set } = store;

	// --- Internal Methods (prefixed with _) ---

	function _addMessage(role: 'user' | 'assistant', content: string) {
		update((state) => {
			// Basic lock to prevent multiple assistant messages too quickly
			if (state._internal.messageLock && role === 'assistant') {
				console.warn('[ConvStore] messageLock active, dropping assistant msg:', content.substring(0,50)+'...');
				return state;
			}
			let messageLock = state._internal.messageLock;
			if (role === 'assistant') {
				messageLock = true; // Lock when assistant speaks
			}
			const newState: ConversationState = {
				...state,
				_internal: { ...state._internal, messageLock },
				messages: [...state.messages, { role, content, timestamp: Date.now() }]
			};
			// Unlock shortly after assistant message is added
			if (role === 'assistant') {
				setTimeout(() => {
					update((s) => ({ ...s, _internal: { ...s._internal, messageLock: false } }));
				}, 10); // Small delay
			}
			return newState;
		});
	}

	function _updateStatus(newStatus: string, newProgress?: number) {
		update((state) => ({
			...state,
			status: newStatus,
			// Update progress only if provided, clamping between 0 and 100
			...(newProgress !== undefined && { progress: Math.max(0, Math.min(100, newProgress)) })
		}));
	}

	function _setProcessing(processing: boolean) {
		update((state) => {
			// Keep status message if processing just finished, otherwise clear it
			const statusToKeep = state.status && !state.isProcessing && processing === false;
			const newStatus = processing ? state.status : (statusToKeep ? state.status : '');
			const newProgress = processing ? state.progress : (statusToKeep ? state.progress : 0);
			return {
				...state,
				isProcessing: processing,
				status: newStatus,
				progress: newProgress,
				// Clear background task ID when processing stops
				_internal: {
					...state._internal,
					backgroundTaskId: processing ? state._internal.backgroundTaskId : null
				}
			};
		});
	}

	function _setBackgroundTaskId(taskId: ReturnType<typeof setTimeout> | null) {
		update((state) => ({
			...state,
			_internal: { ...state._internal, backgroundTaskId: taskId }
		}));
	}

	function _clearBackgroundProcessing() {
		// Use get() to access current state if needed outside update
		const currentTaskId = get(store)._internal.backgroundTaskId;
		if (currentTaskId != null) {
			clearTimeout(currentTaskId);
			_setBackgroundTaskId(null); // Update state via method
			console.log('[ConvStore] Cleared existing background task.');
		}
	}

	// REMOVED: _updateExtractedTransactions, _appendExtractedTransactions, _replaceLastExtraction, _addTransactions
	// These are no longer needed as transactions live in appStore

	function _setLastExtractionResult(
		// transactions: Transaction[], // No longer need transactions here
		originalInput: string,
		// appliedDirection: 'in' | 'out' | null // Direction context might still be useful
	) {
		update((state) => ({
			...state,
			_internal: {
				...state._internal,
				lastUserMessageText: originalInput,
				lastExtractionBatchId: uuidv4() // Generate new batch ID for this context
			}
		}));
	}

	function _setClarificationNeeded(needed: boolean, txnIds: string[]) {
		update((state) => ({
			...state,
			_internal: {
				...state._internal,
				waitingForDirectionClarification: needed,
				clarificationTxnIds: needed ? txnIds : []
			}
		}));
	}

	function _setInitialPromptSent(sent: boolean) {
		update((state) => ({
			...state,
			_internal: { ...state._internal, initialPromptSent: sent }
		}));
	}

	function _setUserMood(mood: UserMood) {
		update((state) => ({ ...state, userMood: mood }));
	}

	function _clearLastInputContext() {
		update((state) => ({
			...state,
			_internal: {
				...state._internal,
				lastUserMessageText: '',
				lastExtractionBatchId: null
			}
		}));
	}

    // --- CORRECTLY DEFINED Duplicate Confirmation Methods ---
    function _setDuplicateConfirmationNeeded(needed: boolean, transactions: Transaction[] = []) {
        update(state => ({
            ...state,
            _internal: {
                ...state._internal,
                waitingForDuplicateConfirmation: needed,
                // Store copies to avoid mutation issues
                pendingDuplicateTransactions: needed ? [...transactions] : []
            }
        }));
    }

    function _clearDuplicateConfirmation() {
        // Simply call the setter with false
        _setDuplicateConfirmationNeeded(false);
    }
    // --- END Duplicate Confirmation Methods ---

	function reset() {
		_clearBackgroundProcessing();
        _clearDuplicateConfirmation(); // Ensure confirmation state is cleared on reset
		// Reset to a fresh initial state
        const freshInitialState = {
            ...initialState,
            _internal: { ...initialState._internal } // Ensure internal state is also reset
        };
		set(freshInitialState);
	}

	// Return the public interface of the store
	return {
		subscribe,
		update, // Expose update for advanced use cases if needed, otherwise remove
		set,    // Expose set for replacing state if needed, otherwise remove
		reset,

		// --- Public Methods --- (Consider if all internal methods need to be public)
		_addMessage,
		_updateStatus,
		_setProcessing,
		_setBackgroundTaskId,
		_clearBackgroundProcessing,
		// Removed transaction methods
		_setLastExtractionResult,
		_setClarificationNeeded,
		_setInitialPromptSent,
		_setUserMood,
		_clearLastInputContext,
        // --- Export NEW methods ---
        _setDuplicateConfirmationNeeded,
        _clearDuplicateConfirmation,
        // --- END Export NEW methods ---

		// Helper to get internal state without subscribing externally
		_getInternalState: () => {
			// Use get() for safety if called outside component lifecycle
			return get(store)._internal;
		}
	};
}

// Create and export the store instance
export const conversationStore = createInternalConversationStore();

// Export a readable version if external components only need to subscribe
export const conversationReadable = {
	subscribe: conversationStore.subscribe
} as Readable<ConversationState>;

