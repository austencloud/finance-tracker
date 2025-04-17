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
import { resolveAndFormatDate } from '$lib/utils/date';
import { categorizeTransaction } from '$lib/services/categorizer';

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
	const splitRegex =
		/\bsplit\b(?:.*?)(?:[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b)?\s?((?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?))\s?([kK])?/i;
	const splitMatch = message.match(splitRegex);
	const today = new Date().toISOString().split('T')[0];

	if (splitMatch && splitMatch.index !== undefined) {
		let amountStr = splitMatch[1].replace(/,/g, '');
		const kSuffix = splitMatch[2];
		if (kSuffix) {
			const num = parseFloat(amountStr);
			amountStr = isNaN(num) ? amountStr : (num * 1000).toString();
		}
		const total = parseFloat(amountStr);

		if (!isNaN(total)) {
			const currencyMatch = splitMatch[0].match(/[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b/i);
			const detectedCurrency = currencyMatch ? currencyMatch[0].toUpperCase() : 'USD';

			let contextDescription = 'Split Bill';
			try {
				const splitKeywordEndIndex = message.toLowerCase().indexOf('split') + 5;
				const matchStartIndex = splitMatch.index;
				if (matchStartIndex > splitKeywordEndIndex) {
					let rawDesc = message.substring(splitKeywordEndIndex, matchStartIndex).trim();
					rawDesc = rawDesc.replace(/^(a|the|an)\s+/i, '');
					rawDesc = rawDesc.replace(/\s+(?:bill|costs?)$/i, '');
					rawDesc = rawDesc.replace(/\s+(?:with|for|at|on)$/i, '');
					rawDesc = rawDesc.replace(/^[,\s.:-]+|[,\s.:-]+$/g, '');
					const keywords = ['lunch', 'dinner', 'groceries', 'tickets', 'cab', 'hotel', 'rent', 'sushi'];
					const keywordMatch = keywords.find(kw => rawDesc.toLowerCase().includes(kw));
					if (keywordMatch) {
						contextDescription = keywordMatch.charAt(0).toUpperCase() + keywordMatch.slice(1);
					} else if (rawDesc) {
						contextDescription = rawDesc;
					}
				}
			} catch (e) {
				console.error("Error extracting split description context:", e);
			}

			const contextDate = resolveAndFormatDate(message);

			appStore.setWaitingForSplitBillShare({
				totalAmount: total,
				currency: detectedCurrency,
				originalMessage: message,
				possibleDate: contextDate,
				description: contextDescription
			});

			appStore.addConversationMessage(
				'assistant',
				`You mentioned splitting "${contextDescription}" (total approx. ${total} ${detectedCurrency}). How much was *your* specific share (just the number)?`
			);
			appStore.setConversationStatus('Awaiting split-bill share', 100);
			return { handled: true, response: '' };
		} else {
			console.warn('[ExtractionHandler] Could not parse split amount from:', splitMatch[0]);
		}
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

			if (parsedTransactions.length === 0) {
				console.warn(`[Extraction] No transactions parsed, attempting retry...`);
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
