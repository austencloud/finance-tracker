import { get } from 'svelte/store';
import { appStore } from '$lib/stores/AppStore';

import { getLLMFallbackResponse, llmChat } from '../../llm';
import { getSystemPrompt } from '../../prompts';

import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { applyExplicitDirection } from '$lib/utils/helpers';
import type { Transaction } from '$lib/stores/types';
import { v4 as uuidv4 } from 'uuid';

export async function handleCountCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();
	const countKeywords = [
		'missed',
		'only',
		'should be',
		'there were',
		'count is wrong',
		'more than that',
		'less than that',
		'wrong number'
	];
	const containsCountKeyword = countKeywords.some((keyword) => lowerMessage.includes(keyword));
	const containsNumber = /\d+/.test(lowerMessage);

	const conversationInternalState = get(appStore).conversation._internal;
	const originalText = conversationInternalState.lastUserMessageText;
	const lastBatchId = conversationInternalState.lastExtractionBatchId;

	const hasContextForCorrection = !!originalText && !!lastBatchId;

	if (!containsCountKeyword || !containsNumber || !hasContextForCorrection) {
		return { handled: false };
	}

	const currentMainTransactions = get(appStore).transactions;
	const previousBatchTransactions = currentMainTransactions.filter(
		(t) => t.batchId === lastBatchId
	);
	const previousTransactionCount = previousBatchTransactions.length;

	console.log(
		`[CountCorrectionHandler] Detected count correction for batch ${lastBatchId}. Original text present. Previous count (estimated): ${previousTransactionCount}`
	);
	appStore.setConversationStatus('Re-evaluating extraction...', 30);

	try {
		const correctionHint = message;

		const reExtractionPrompt = `
            The user previously provided the following text for transaction extraction:
            """
            ${originalText}
            """
            My previous attempt might have extracted an incorrect number of transactions (estimated ${previousTransactionCount} found).
            The user has now provided the following correction regarding the count:
            """
            ${correctionHint}
            """
            Please re-analyze the original text carefully, paying close attention to the user's correction about the number of transactions. Extract the transactions again based on this new information. Ensure you capture the correct number of items. Format the output as a JSON object containing a "transactions" array, where each element follows the Transaction schema (date, description, details, type, amount, direction).
            JSON Object:
        `;

		const today = new Date().toISOString().split('T')[0];
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: reExtractionPrompt }
		];

		const aiResponse = await llmChat(messages, { temperature: 0.2, rawUserText: message });

		const newCorrectionBatchId = uuidv4();

		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, newCorrectionBatchId);

		if (!Array.isArray(parsedTransactions)) {
			console.warn(
				'[CountCorrectionHandler] Failed to parse valid transaction array from AI after correction attempt.'
			);
			throw new Error('AI did not return valid JSON data after correction.');
		}

		if (parsedTransactions.length === 0) {
			console.log('[CountCorrectionHandler] AI returned empty array after correction attempt.');
			appStore._setConversationInternalState({
				lastUserMessageText: '',
				lastExtractionBatchId: null
			});
			throw new Error('AI did not find any transactions after correction.');
		}

		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent).map(
			(txn) => ({
				...txn,

				batchId: newCorrectionBatchId
			})
		);

		appStore.addTransactions(finalTransactions);

		const response = `Okay, I've re-analyzed the text based on your correction. I've added ${finalTransactions.length} transaction(s) based on that. Please check the list.`;
		appStore.setConversationStatus('Extraction updated', 100);

		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});
		return { handled: true, response: response };
	} catch (error) {
		console.error('[CountCorrectionHandler] Error during re-extraction:', error);
		appStore.setConversationStatus('Error during correction');
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});
		return { handled: true, response: errorMsg };
	}
}
