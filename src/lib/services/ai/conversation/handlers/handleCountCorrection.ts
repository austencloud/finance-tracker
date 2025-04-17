import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { appStore } from '$lib/stores/AppStore';

import { getLLMFallbackResponse, llmChat } from '../../llm-helpers';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { applyExplicitDirection } from '$lib/utils/helpers';
import type { Transaction } from '$lib/types/types';

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
	const containsCountKeyword = countKeywords.some((k) => lowerMessage.includes(k));
	const containsNumber = /\d+/.test(lowerMessage);

	const internal = get(appStore).conversation._internal;
	const originalText = internal.lastUserMessageText;
	const lastBatchId = internal.lastExtractionBatchId;

	if (!containsCountKeyword || !containsNumber || !originalText || !lastBatchId) {
		return { handled: false };
	}

	appStore.setConversationStatus('Re‑evaluating extraction...', 30);

	try {
		const correctionHint = message;
		const today = new Date().toISOString().slice(0, 10);

		// Build a combined text for re‑extraction
		const combinedText = `
      Original user input:
      """
      ${originalText}
      """
      Correction about count:
      """
      ${correctionHint}
      """
    `.trim();

		// Use the same extraction prompt but feed in combinedText
		const extractionPrompt = getExtractionPrompt(combinedText, today);

		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: extractionPrompt }
		];

		// Request JSON‑only output
		const aiResponse = await llmChat(messages, {
			temperature: 0.2,
			rawUserText: message,
			requestJsonFormat: true
		});

		const newBatchId = uuidv4();
		const parsed = parseTransactionsFromLLMResponse(aiResponse, newBatchId);

		if (!Array.isArray(parsed) || parsed.length === 0) {
			throw new Error('AI did not find any transactions after correction.');
		}

		// Apply explicit in/out override if needed
		const corrected = applyExplicitDirection(parsed, explicitDirectionIntent).map((txn) => ({
			...txn,
			batchId: newBatchId
		}));

		appStore.addTransactions(corrected);

		appStore.setConversationStatus('Extraction updated', 100);
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});

		return {
			handled: true,
			response: `Okay, I've re‑analyzed and added ${corrected.length} transaction(s) based on your correction.`
		};
	} catch (err) {
		console.error('[CountCorrectionHandler] Error during re‑extraction:', err);
		appStore.setConversationStatus('Error during correction');
		appStore._setConversationInternalState({
			lastUserMessageText: '',
			lastExtractionBatchId: null
		});
		return {
			handled: true,
			response: getLLMFallbackResponse(err instanceof Error ? err : undefined)
		};
	}
}
