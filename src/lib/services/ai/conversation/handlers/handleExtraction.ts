// src/lib/services/ai/conversation/handlers/handleExtraction.ts
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

// --- Import AppStore ---
import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/stores/types';

// --- REMOVE old store imports ---
// import { lastExtractionResult, extractedTransactions } from '../conversationDerivedStores';
// import { conversationStore } from '../conversationStore';

// --- Keep other necessary imports ---
import {
	applyExplicitDirection,
	parseJsonFromAiResponse,
	textLooksLikeTransaction
} from '$lib/utils/helpers';
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getExtractionPrompt, getSystemPrompt } from '../../prompts';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';

// --- Helper Functions (Normalization, Key Creation - remain the same) ---
function normalizeDescription(desc: string | undefined | null): string {
	if (!desc) return 'unknown';
	return desc.toLowerCase().replace(/\s+/g, ' ').trim();
}
function createTransactionKey(txn: Transaction): string {
	// Use optional chaining and default values for safety
	const amountStr = typeof txn.amount === 'number' ? txn.amount.toFixed(2) : '0.00';
	return `${txn.date || 'unknown'}-${amountStr}-${normalizeDescription(txn.description)}-${txn.direction || 'unknown'}`;
}

/**
 * Handles messages containing new transaction data using appStore.
 */

/**
 * Handles messages containing new transaction data using appStore.
 */
export async function handleExtraction(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string; extractedCount?: number }> {
	if (!textLooksLikeTransaction(message)) {
		return { handled: false };
	}

	const lastProcessedMessage = get(appStore).conversation._internal.lastUserMessageText;

	// Prevent re-processing identical consecutive messages
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

	// --- Generate a batchId for THIS extraction attempt ---
	const batchId = uuidv4();
	console.log(`[ExtractionHandler] Generated batchId: ${batchId}`);

	try {
		const today = new Date().toISOString().split('T')[0];
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: extractionPrompt }
		];

		// Using deepseekChat here based on previous service code structure
		const aiResponse = await deepseekChat(messages, { temperature: 0.2 });

		// --- Pass the generated batchId to the parser ---
		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, batchId); // <-- Pass batchId

		if (!Array.isArray(parsedTransactions)) {
			console.warn('[ExtractionHandler] Failed to parse valid transaction array from AI response.');
			const fallback = getFallbackResponse(new Error('AI response parsing failed'));
			appStore.setConversationStatus('Error parsing response');
			return { handled: true, response: fallback };
		}

		// The rest of the logic uses the result from the parser, which now includes the batchId

		if (parsedTransactions.length === 0) {
			console.log(
				'[ExtractionHandler] Parser returned empty array, no new transactions found or validated.'
			);
			appStore.setConversationStatus('No new transactions found', 100);
			const responseMsg =
				"I looked through that text but couldn't find any clear transactions to add.";
			// Set context even on failure to prevent immediate re-processing of same message
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			return { handled: true, response: responseMsg };
		}

		let finalTransactionsPotentiallyWithDuplicates = applyExplicitDirection(
			parsedTransactions, // These already have batchId from the parser
			explicitDirectionIntent
		);

		const currentMainTransactions = get(appStore).transactions;
		const existingKeys = new Set(currentMainTransactions.map(createTransactionKey));

		const trulyNewTransactions = finalTransactionsPotentiallyWithDuplicates.filter(
			(newTxn) => !existingKeys.has(createTransactionKey(newTxn))
		);

		if (trulyNewTransactions.length === 0) {
			const duplicateCount = finalTransactionsPotentiallyWithDuplicates.length;
			console.warn(
				`[ExtractionHandler] All ${duplicateCount} extracted transaction(s) are duplicates.`
			);
			appStore.setConversationStatus('Duplicates detected', 100);
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			return {
				handled: true,
				response: "It looks like I've already recorded all of those transactions."
			};
		} else {
			const duplicateCount =
				finalTransactionsPotentiallyWithDuplicates.length - trulyNewTransactions.length;
			console.log(
				`[ExtractionHandler] Adding ${trulyNewTransactions.length} new transaction(s). Found ${duplicateCount} duplicate(s).`
			);

			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			appStore.addTransactions(trulyNewTransactions); // This adds to main list & triggers analysis

			let response = `Added ${trulyNewTransactions.length} new transaction(s).`;
			if (duplicateCount > 0) {
				response += ` (Ignored ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}).`;
			}
			response += ` You can see them in the list now.`;

			appStore.setConversationStatus('Extraction complete', 100);
			return { handled: true, response: response, extractedCount: trulyNewTransactions.length };
		}
	} catch (error) {
		console.error('[ExtractionHandler] Error during extraction:', error);
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		appStore.setConversationStatus('Error during extraction');
		// Also set context here so identical erroring messages aren't immediately retried
		appStore._setConversationInternalState({
			lastUserMessageText: message,
			lastExtractionBatchId: batchId
		});
		return { handled: true, response: errorMsg };
	}
}
