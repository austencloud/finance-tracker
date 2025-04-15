import type { Transaction } from '$lib/stores/types';
import { writable, get, type Writable, type Readable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number;
}

export type UserMood = 'neutral' | 'frustrated' | 'chatty' | 'unknown';

export interface ConversationState {
	messages: ConversationMessage[];
	status: string;
	isProcessing: boolean;
	progress: number;
	extractedTransactions: Transaction[];
	userMood: UserMood;
	_internal: {
		initialPromptSent: boolean;
		messageLock: boolean;
		backgroundTaskId: ReturnType<typeof setTimeout> | null;
		waitingForDirectionClarification: boolean;
		clarificationTxnIds: string[];
		lastUserMessageText: string;
		lastExtractionBatchId: string | null;
	};
}

const initialState: ConversationState = {
	messages: [],
	status: '',
	isProcessing: false,
	progress: 0,
	extractedTransactions: [],
	userMood: 'unknown',
	_internal: {
		initialPromptSent: false,
		messageLock: false,
		backgroundTaskId: null,
		waitingForDirectionClarification: false,
		clarificationTxnIds: [],
		lastUserMessageText: '',
		lastExtractionBatchId: null
	}
};

function createInternalConversationStore() {
	const store: Writable<ConversationState> = writable(initialState);
	const { subscribe, update, set } = store;

	function _addMessage(role: 'user' | 'assistant', content: string) {
		update((state) => {
			if (state._internal.messageLock && role === 'assistant') {
				console.warn('[ConvStore] messageLock active, dropping assistant msg:', content);
				return state;
			}
			let messageLock = state._internal.messageLock;
			if (role === 'assistant') {
				messageLock = true;
			}
			const newState: ConversationState = {
				...state,
				_internal: { ...state._internal, messageLock },
				messages: [...state.messages, { role, content, timestamp: Date.now() }]
			};
			if (role === 'assistant') {
				setTimeout(() => {
					update((s) => ({ ...s, _internal: { ...s._internal, messageLock: false } }));
				}, 0);
			}
			return newState;
		});
	}

	function _updateStatus(newStatus: string, newProgress?: number) {
		update((state) => ({
			...state,
			status: newStatus,
			...(newProgress !== undefined && { progress: Math.max(0, Math.min(100, newProgress)) })
		}));
	}

	function _setProcessing(processing: boolean) {
		update((state) => {
			const statusToKeep = state.status && !state.isProcessing && processing === false;
			const newStatus = processing ? state.status : statusToKeep ? state.status : '';
			const newProgress = processing ? state.progress : statusToKeep ? state.progress : 0;
			return {
				...state,
				isProcessing: processing,
				status: newStatus,
				progress: newProgress,
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
		const currentTaskId = conversationStore._getInternalState().backgroundTaskId;
		if (currentTaskId != null) {
			clearTimeout(currentTaskId);
			_setBackgroundTaskId(null);
			console.log('[ConvStore] Cleared existing background task.');
		}
	}

	function _updateExtractedTransactions(
		transactions: Transaction[],
		associatedMessage: string,
		batchId: string
	) {
		update((state) => ({
			...state,
			extractedTransactions: transactions,
			_internal: {
				...state._internal,
				lastUserMessageText: associatedMessage,
				lastExtractionBatchId: batchId
			}
		}));
	}

	function _setLastExtractionResult(
		transactions: Transaction[],
		originalInput: string,
		appliedDirection: 'in' | 'out' | null
	) {
		update((state) => ({
			...state,
			_internal: {
				...state._internal,
				lastUserMessageText: originalInput,
				lastExtractionBatchId: uuidv4()
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

	function reset() {
		_clearBackgroundProcessing();
		set(initialState);
	}

	return {
		subscribe,
		update,
		set,
		reset,

		_addMessage,
		_updateStatus,
		_setProcessing,
		_setBackgroundTaskId,
		_clearBackgroundProcessing,
		_updateExtractedTransactions,
		_appendExtractedTransactions,
		_replaceLastExtraction,
		_addTransactions,
		_setLastExtractionResult,
		_setClarificationNeeded,
		_setInitialPromptSent,
		_setUserMood,
		_clearLastInputContext,

		_getInternalState: () => {
			let internal: ConversationState['_internal'] = initialState._internal;
			subscribe(($state) => (internal = $state._internal))();
			return internal;
		}
	};
	function _addTransactions(newTransactions: Transaction[]) {
		if (!Array.isArray(newTransactions)) {
			console.error('[ConvStore] Tried to add non-array transactions:', newTransactions);
			return;
		}

		update((state) => ({
			...state,
			extractedTransactions: [...state.extractedTransactions, ...newTransactions]
		}));
	}

	function _appendExtractedTransactions(
		newTransactions: Transaction[],
		associatedMessage: string,
		batchId: string
	) {
		if (!Array.isArray(newTransactions)) {
			console.error('[ConvStore] Tried to append non-array transactions:', newTransactions);
			return;
		}

		update((state) => ({
			...state,
			extractedTransactions: [...state.extractedTransactions, ...newTransactions],
			_internal: {
				...state._internal,
				lastUserMessageText: associatedMessage,
				lastExtractionBatchId: batchId
			}
		}));
	}

	function _replaceLastExtraction(
		newTransactions: Transaction[],
		originalInput: string,
		appliedDirection: 'in' | 'out' | null
	) {
		if (!Array.isArray(newTransactions)) {
			console.error('[ConvStore] Tried to replace with non-array transactions:', newTransactions);
			return;
		}
		// --- NEW METHODS ---
		function _setDuplicateConfirmationNeeded(needed: boolean, transactions: Transaction[] = []) {
			update((state) => ({
				...state,
				_internal: {
					...state._internal,
					waitingForDuplicateConfirmation: needed,
					// Store copies to avoid mutation issues if needed
					pendingDuplicateTransactions: needed ? [...transactions] : []
				}
			}));
		}

		function _clearDuplicateConfirmation() {
			_setDuplicateConfirmationNeeded(false);
		}
		update((state) => {
			console.log(`[ConvStore] Replacing extracted txns with ${newTransactions.length}.`);
			return {
				...state,
				extractedTransactions: newTransactions,
				_internal: {
					...state._internal,
					lastUserMessageText: originalInput,
					lastExtractionBatchId: null
				}
			};
		});
	}
}

export const conversationStore = createInternalConversationStore();

export const conversationReadable = {
	subscribe: conversationStore.subscribe
} as Readable<ConversationState>;
