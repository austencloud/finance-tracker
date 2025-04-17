// src/lib/stores/conversationStore.ts
import { writable, get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import type {
	ConversationState,
	ConversationMessage,
	SplitBillContext,
	Transaction
} from '../types/types'; // Adjust path

// Helper can remain here or move to utils
const createMsg = (role: ConversationMessage['role'], content: string): ConversationMessage => ({
	id: uuidv4(),
	role,
	content: content.trim(), // Trim content here
	timestamp: Date.now()
});

const initialConversationState: ConversationState = {
	messages: [
		createMsg(
			'assistant',
			"Hello! I'm your AI Transaction Assistant. Paste your transaction data or describe your spending and I'll help you organise it."
		)
	],
	status: '',
	isProcessing: false,
	progress: 0,
	userMood: 'unknown',
	_internal: {
		initialPromptSent: false,
		waitingForDirectionClarification: false,
		clarificationTxnIds: [],
		lastUserMessageText: '',
		lastExtractionBatchId: null,
		waitingForDuplicateConfirmation: false,
		// Ensure pendingDuplicateTransactions is initialized correctly
		pendingDuplicateTransactions: [],
		waitingForCorrectionClarification: false,
		pendingCorrectionDetails: null,
		llmAvailable: false, // Should be set by an initial check
		lastCorrectionTxnId: null,
		waitingForSplitBillShare: false,
		splitBillContext: null
	}
};

const { subscribe, update } = writable<ConversationState>(initialConversationState);

export const conversationStore = {
	subscribe,
	addMessage: (role: ConversationMessage['role'], content: string) => {
		const msg = createMsg(role, content);
		update((s) => ({ ...s, messages: [...s.messages, msg] }));
	},
	reset: () => {
		update((s) => ({
			...initialConversationState,
			// Persist LLM availability across resets
			_internal: {
				...initialConversationState._internal,
				llmAvailable: s._internal.llmAvailable
			},
			messages: [createMsg('assistant', 'Okay, starting fresh. How can I help you?')]
		}));
	},
	setStatus: (status: string, progress?: number) => {
		update((s) => ({
			...s,
			status,
			progress: progress !== undefined ? Math.max(0, Math.min(100, progress)) : s.progress
		}));
	},
	setProcessing: (isProcessing: boolean) => {
		update((s) => ({
			...s,
			isProcessing,
			status: isProcessing ? s.status : '',
			progress: isProcessing ? s.progress : 0
		}));
	},
	setLLMAvailability: (available: boolean) => {
		update((s) => ({ ...s, _internal: { ...s._internal, llmAvailable: available } }));
	},
	setWaitingForSplitBillShare: (context: SplitBillContext) => {
		update((s) => ({
			...s,
			_internal: {
				...s._internal,
				waitingForSplitBillShare: true,
				splitBillContext: context || null
			}
		}));
	},
	clearSplitBillWaitState: () => {
		update((s) => {
			if (!s._internal.waitingForSplitBillShare) return s;
			return {
				...s,
				_internal: { ...s._internal, waitingForSplitBillShare: false, splitBillContext: null }
			};
		});
	},
	setCorrectionClarificationNeeded: (
		pendingDetails: Exclude<
			ConversationState['_internal']['pendingCorrectionDetails'],
			null | undefined
		>
	) => {
		update((s) => ({
			...s,
			_internal: {
				...s._internal,
				waitingForCorrectionClarification: true,
				pendingCorrectionDetails: pendingDetails
			}
		}));
	},
	clearCorrectionClarificationState: () => {
		update((s) => {
			if (!s._internal.waitingForCorrectionClarification) return s;
			return {
				...s,
				_internal: {
					...s._internal,
					waitingForCorrectionClarification: false,
					pendingCorrectionDetails: null
				}
			};
		});
	},
	setDirectionClarificationNeeded: (needed: boolean, txnIds: string[]) => {
		update((s) => ({
			...s,
			_internal: {
				...s._internal,
				waitingForDirectionClarification: needed,
				clarificationTxnIds: needed ? txnIds : []
			}
		}));
	},
	setDuplicateConfirmationNeeded: (needed: boolean, pendingTxns: Transaction[] = []) => {
		update((s) => ({
			...s,
			_internal: {
				...s._internal,
				waitingForDuplicateConfirmation: needed,
				pendingDuplicateTransactions: needed ? pendingTxns : []
			}
		}));
	},
	// Internal state setter - use carefully! Allows handlers to update context like last message
	_setInternalState: (updates: Partial<ConversationState['_internal']>) => {
		update((s) => ({ ...s, _internal: { ...s._internal, ...updates } }));
	},
	// Specific context clearing, e.g., after a correction or failed extraction
	clearCorrectionContext: () => {
		update((s) => ({
			...s,
			_internal: {
				...s._internal,
				lastUserMessageText: '',
				lastExtractionBatchId: null,
				lastCorrectionTxnId: null
			}
		}));
	},
	setConversationClarificationNeeded(needed: boolean, txnIds: string[]) {
		update((s) => ({
			...s,
			conversation: {
				...s,
				_internal: {
					...s._internal,
					waitingForDirectionClarification: needed,
					clarificationTxnIds: needed ? txnIds : []
				}
			}
		}));
	},
};
