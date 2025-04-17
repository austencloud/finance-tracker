import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/stores/types';
import {
	applyExplicitDirection,
	textLooksLikeTransaction,
	parseJsonFromAiResponse
} from '$lib/utils/helpers';
import { getExtractionPrompt, getSystemPrompt } from '../../prompts';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers';

function normalizeDescription(desc: string | undefined | null): string {
	if (!desc) return 'unknown';
	return desc.toLowerCase().replace(/\s+/g, ' ').trim();
}
function createTransactionKey(txn: Transaction): string {
	const amountStr = typeof txn.amount === 'number' ? txn.amount.toFixed(2) : '0.00';
	return `${txn.date || 'unknown'}-${amountStr}-${normalizeDescription(txn.description)}-${txn.direction || 'unknown'}`;
}

export async function handleExtraction(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string; extractedCount?: number }> {
	// Intercept "split $X" mentions and ask for responsible share first
	const splitMatch = message.match(/\bsplit\b.*\$(\d+(\.\d{1,2})?)/i);
	if (splitMatch) {
		const total = splitMatch[1];
		appStore.addConversationMessage(
			'assistant',
			`You mentioned splitting a $${total} bill — how many people split it, and how much were *you* responsible for?`
		);
		appStore.setConversationStatus('Awaiting split‑bill details', 100);
		return { handled: true, response: '' };
	}

	if (!textLooksLikeTransaction(message)) {
		return { handled: false };
	}

	const lastProcessedMessage = get(appStore).conversation._internal.lastUserMessageText;
	if (lastProcessedMessage && lastProcessedMessage === message) {
		console.warn('[ExtractionHandler] Input message identical to last. Preventing re-addition.');
		appStore.addConversationMessage(
			'assistant',
			"It looks like I've already processed that exact text."
		);
		return { handled: true, response: '' };
	}

	console.log('[ExtractionHandler] Handling additional transaction data extraction.');
	appStore.setConversationStatus('Extracting transactions...', 30);

	const batchId = uuidv4();
	console.log(`[ExtractionHandler] Generated batchId: ${batchId}`);

	try {
		const today = new Date().toISOString().split('T')[0];
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: extractionPrompt }
		];

		let aiResponse = await llmChat(messages, { temperature: 0.2, rawUserText: message });
		let parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, batchId);

		const estimateClauses = message
			.split(/\band\b/i)
			.map((s) => s.trim())
			.filter(Boolean).length;
		if (Array.isArray(parsedTransactions) && parsedTransactions.length < estimateClauses) {
			console.log(
				`[Extraction] Found ${parsedTransactions.length} valid transactions out of approximately ${estimateClauses} mentioned. Proceeding with what we have.`
			);

			// Only retry if we got nothing at all
			if (parsedTransactions.length === 0) {
				console.warn(`[Extraction] No transactions parsed, attempting retry...`);
				// (retry logic here)
			}
		}

		if (!Array.isArray(parsedTransactions)) {
			console.warn('[ExtractionHandler] Failed to parse valid transaction array from AI response.');
			const fallback = getLLMFallbackResponse(new Error('AI response parsing failed'));
			appStore.setConversationStatus('Error parsing response');
			appStore.clearCorrectionContext();
			return { handled: true, response: fallback };
		}

		if (parsedTransactions.length === 0) {
			console.log(
				'[ExtractionHandler] Parser returned empty array, no new transactions found or validated.'
			);
			appStore.setConversationStatus('No new transactions found', 100);
			const responseMsg =
				"I looked through that text but couldn't find any clear transactions to add.";
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			return { handled: true, response: responseMsg };
		}

		let finalTransactionsPotentiallyWithDuplicates = applyExplicitDirection(
			parsedTransactions,
			explicitDirectionIntent
		);

		const currentMainTransactions = get(appStore).transactions;
		const existingKeys = new Set(currentMainTransactions.map(createTransactionKey));

		const trulyNewTransactions = finalTransactionsPotentiallyWithDuplicates.filter(
			(newTxn) => !existingKeys.has(createTransactionKey(newTxn))
		);

		const duplicateCount =
			finalTransactionsPotentiallyWithDuplicates.length - trulyNewTransactions.length;
		let response = '';

		if (trulyNewTransactions.length > 0) {
			console.log(
				`[ExtractionHandler] Adding ${trulyNewTransactions.length} new transaction(s). Found ${duplicateCount} duplicate(s).`
			);
			appStore.addTransactions(trulyNewTransactions);
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			response = `Added ${trulyNewTransactions.length} new transaction(s).`;
			if (duplicateCount > 0) {
				response += ` (Ignored ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}).`;
			}
			response += ` You can see them in the list now.`;
			appStore.setConversationStatus('Extraction complete', 100);
			return { handled: true, response: response, extractedCount: trulyNewTransactions.length };
		} else {
			console.warn(
				`[ExtractionHandler] All ${finalTransactionsPotentiallyWithDuplicates.length} extracted transaction(s) are duplicates.`
			);
			appStore.setConversationStatus('Duplicates detected', 100);
			appStore.clearCorrectionContext();
			response = "It looks like I've already recorded all of those transactions.";
			return { handled: true, response: response };
		}
	} catch (error) {
		console.error('[ExtractionHandler] Error during extraction:', error);
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		appStore.setConversationStatus('Error during extraction');
		appStore.clearCorrectionContext();
		return { handled: true, response: errorMsg };
	}
}
