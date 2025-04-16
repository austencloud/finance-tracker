import { appStore } from '$lib/stores/AppStore';
import { get } from 'svelte/store';
import type { Transaction } from '$lib/stores/types';

function clearDuplicateConfirmationState(): void {
	appStore._setConversationInternalState({
		waitingForDuplicateConfirmation: false,
		pendingDuplicateTransactions: [],
		lastUserMessageText: '',
		lastExtractionBatchId: null
	});
}

export async function handleDuplicateConfirmation(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	const internalState = get(appStore).conversation._internal;

	if (!internalState.waitingForDuplicateConfirmation) {
		return { handled: false };
	}

	const lowerMessage = message.toLowerCase().trim();
	const pendingTransactions = internalState.pendingDuplicateTransactions || [];

	if (
		lowerMessage === 'yes' ||
		lowerMessage === 'y' ||
		lowerMessage === 'add them' ||
		lowerMessage === 'add it' ||
		lowerMessage === 'add again'
	) {
		console.log('[DuplicateConfirmationHandler] User confirmed adding duplicates.');

		if (pendingTransactions.length > 0) {
			appStore.addTransactions(pendingTransactions);
			clearDuplicateConfirmationState();
			return {
				handled: true,
				response: `Okay, I've added the duplicate transaction${pendingTransactions.length > 1 ? 's' : ''} again. What's next?`
			};
		} else {
			console.warn(
				'[DuplicateConfirmationHandler] Confirmation flag was set, but no pending transactions found.'
			);
			clearDuplicateConfirmationState();
			return {
				handled: true,
				response:
					"Something went wrong, I didn't have the duplicates saved properly. Please try adding them again if needed."
			};
		}
	} else if (
		lowerMessage === 'no' ||
		lowerMessage === 'n' ||
		lowerMessage === 'cancel' ||
		lowerMessage === "don't add" ||
		lowerMessage === 'do not add'
	) {
		console.log('[DuplicateConfirmationHandler] User rejected adding duplicates.');
		clearDuplicateConfirmationState();

		return {
			handled: true,
			response: "Okay, I won't add the duplicates. Let me know what else I can help with."
		};
	} else {
		console.log('[DuplicateConfirmationHandler] Unclear response, re-prompting.');
		return {
			handled: true,
			response:
				"Sorry, I need a clear 'yes' or 'no'. Should I add the duplicate transaction(s) again?"
		};
	}
}
