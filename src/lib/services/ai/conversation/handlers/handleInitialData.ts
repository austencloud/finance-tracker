import { appStore } from '$lib/stores/AppStore';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import type { Transaction, ConversationMessage } from '$lib/stores/types';

import { llmChat, getLLMFallbackResponse } from '../../llm-helpers';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';
import { textLooksLikeTransaction, applyExplicitDirection } from '$lib/utils/helpers';
import { BULK_DATA_THRESHOLD_LENGTH } from '../constants';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';

export async function handleInitialData(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	const history = get(appStore).conversation.messages as ConversationMessage[];
	const currentMainTransactions = get(appStore).transactions;
	const looksLikeTxn = textLooksLikeTransaction(message);
	const userHistoryCount = history.filter((m) => m.role === 'user').length;
	const isFirstMeaningfulInput = userHistoryCount <= 1 || currentMainTransactions.length === 0;
	const isShortEnough = message.length < BULK_DATA_THRESHOLD_LENGTH;

	console.log('[InitialDataHandler] Checking conditions:', {
		message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
		looksLikeTxn,
		userHistoryCount,
		transactionCount: currentMainTransactions.length,
		isFirstMeaningfulInput,
		isShortEnough
	});

	if (!looksLikeTxn || !isFirstMeaningfulInput || !isShortEnough) {
		console.log('[InitialDataHandler] Conditions NOT met, returning handled: false.');

		return { handled: false };
	}

	console.log('[InitialDataHandler] Conditions met. Handling initial (non-bulk) transaction data.');

	appStore.setConversationStatus('Extracting initial transactions...', 30);

	const newBatchId = uuidv4();
	console.log(`[InitialDataHandler] Generated batchId: ${newBatchId}`);

	try {
		const today = new Date().toISOString().split('T')[0];
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: extractionPrompt }
		];

		const aiResponse = await llmChat(messages, { temperature: 0.2, rawUserText: message });

		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, newBatchId);

		if (!Array.isArray(parsedTransactions)) {
			console.warn(
				'[InitialDataHandler] Failed to parse valid transaction array from AI response.'
			);

			if (
				aiResponse &&
				typeof aiResponse === 'string' &&
				!aiResponse.trim().startsWith('{') &&
				!aiResponse.trim().startsWith('[')
			) {
				console.log(
					'[InitialDataHandler] AI response was text, providing conversational fallback.'
				);

				appStore.clearCorrectionContext();
				appStore.setConversationStatus('Parsing failed', 100);
				return {
					handled: true,
					response:
						'Sorry, I had trouble understanding the transaction details in that format. Could you try phrasing it differently or perhaps using a list format?'
				};
			}

			throw new Error('AI response could not be parsed into valid transaction data structure.');
		}

		if (parsedTransactions.length === 0) {
			console.log('[InitialDataHandler] Parser returned empty array, no transactions found.');
			const responseMsg =
				"I looked through the text but couldn't find any clear transactions to extract. Could you try phrasing it differently or providing more details?";

			appStore.addConversationMessage('assistant', responseMsg);
			appStore.setConversationStatus('No transactions found', 100);

			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: newBatchId
			});

			return { handled: true };
		}

		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent).map(
			(txn) => ({
				...txn,
				id: txn.id || uuidv4()
			})
		);

		console.log('[InitialDataHandler] Adding transactions:', JSON.stringify(finalTransactions));

		appStore.addTransactions(finalTransactions);
		const confirmationMsg =
			`Okay, I've extracted ${finalTransactions.length} transaction(s) and added them to the list. ` +
			`You can review them now or ask me to make corrections.`;
		appStore.setConversationStatus('Initial extraction complete', 100);

		appStore.addConversationMessage('assistant', confirmationMsg);

		appStore._setConversationInternalState({
			lastUserMessageText: message,
			lastExtractionBatchId: newBatchId
		});

		return { handled: true };
	} catch (error) {
		console.error('[InitialDataHandler] Error during initial extraction:', error);

		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);

		appStore.setConversationStatus('Error during extraction');

		appStore.clearCorrectionContext();

		return { handled: true, response: errorMsg };
	}
}
