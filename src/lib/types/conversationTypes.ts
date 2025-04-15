import {
	conversationStore,
	type ConversationState
} from '$lib/services/ai/conversation/conversationStore';
import { derived, type Readable } from 'svelte/store';

// Explicitly cast the conversationStore as a Readable
const conversationReadable = conversationStore as unknown as Readable<ConversationState>;

// --- Publicly Exported Derived Stores (for UI consumption) ---

// Derived store for the list of conversation messages
export const conversationMessages = derived(conversationReadable, ($store) => $store.messages);

// Derived store for the current status message (e.g., "Thinking...")
export const conversationStatus = derived(conversationReadable, ($store) => $store.status);

// Derived store for the boolean processing flag
export const isProcessing = derived(conversationReadable, ($store) => $store.isProcessing);

// Derived store for the processing progress percentage (0-100)
export const conversationProgress = derived(conversationReadable, ($store) => $store.progress);

// Derived store for the array of transactions extracted during the conversation
export const extractedTransactions = derived(
	conversationReadable,
	($store) => $store.extractedTransactions
);

// Derived store for the detected user mood
export const userMood = derived(conversationReadable, ($store) => $store.userMood);

// Derived store providing context about the last extraction attempt
export const lastExtractionResult = derived(conversationReadable, ($store) => ({
	originalUserInput: $store._internal.lastUserMessageText,
	batchId: $store._internal.lastExtractionBatchId
	// Note: This doesn't include the actual transactions from that batch.
}));

// Derived store providing information about clarification state
export const clarificationState = derived(conversationReadable, ($store) => ({
	isWaiting: $store._internal.waitingForDirectionClarification,
	transactionIds: $store._internal.clarificationTxnIds
}));

// Derived store indicating if the initial prompt has been sent/processed
export const initialPromptSent = derived(
	conversationReadable,
	($store) => $store._internal.initialPromptSent
);

// Function to set internal state safely
export const setState = (state: Partial<ConversationState['_internal']>) => {
	conversationStore.update((current) => ({
		...current,
		_internal: {
			...current._internal,
			...state
		}
	}));
};

// Function to safely add assistant message
export const safeAddAssistantMessage = (content: string) => {
	conversationStore._addMessage('assistant', content);
};
