// src/lib/services/ai/conversation/initial-data-handler.ts
import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { getState } from '../conversation';
import { isBulkData, processInitialData } from './conversation-helpers';

/**
 * Handles the initial data processing for a first-time transaction message
 */
export async function handleInitialData(
	message: string
): Promise<{ handled: boolean; response: string }> {
	const { initialPromptSent } = getState();

	if (!initialPromptSent && textLooksLikeTransaction(message)) {
		if (isBulkData(message)) {
			console.log(
				'[sendUserMessage] Initial message is bulk data, skipping processInitialData, handling as bulk.'
			);
			return { handled: false, response: '' };
		}

		await processInitialData(message);
		return { handled: true, response: '' };
	}

	return { handled: false, response: '' };
}
