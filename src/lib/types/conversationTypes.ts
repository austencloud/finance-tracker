import {
	conversationStore,
	type ConversationState
} from '$lib/services/ai/conversation/conversationStore';
import { derived, type Readable } from 'svelte/store';

const conversationReadable = conversationStore as unknown as Readable<ConversationState>;

export const conversationMessages = derived(conversationReadable, ($store) => $store.messages);

export const conversationStatus = derived(conversationReadable, ($store) => $store.status);

export const isProcessing = derived(conversationReadable, ($store) => $store.isProcessing);

export const conversationProgress = derived(conversationReadable, ($store) => $store.progress);

export const extractedTransactions = derived(
	conversationReadable,
	($store) => $store.extractedTransactions
);

export const userMood = derived(conversationReadable, ($store) => $store.userMood);

export const lastExtractionResult = derived(conversationReadable, ($store) => ({
	originalUserInput: $store._internal.lastUserMessageText,
	batchId: $store._internal.lastExtractionBatchId
}));

export const clarificationState = derived(conversationReadable, ($store) => ({
	isWaiting: $store._internal.waitingForDirectionClarification,
	transactionIds: $store._internal.clarificationTxnIds
}));

export const initialPromptSent = derived(
	conversationReadable,
	($store) => $store._internal.initialPromptSent
);

export const setState = (state: Partial<ConversationState['_internal']>) => {
	conversationStore.update((current) => ({
		...current,
		_internal: {
			...current._internal,
			...state
		}
	}));
};

export const safeAddAssistantMessage = (content: string) => {
	conversationStore._addMessage('assistant', content);
};
