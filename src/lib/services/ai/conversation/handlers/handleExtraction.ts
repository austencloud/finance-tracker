// src/lib/services/ai/conversation/handlers/extraction-handler.ts
import { get } from 'svelte/store';
import {
	applyExplicitDirection,
	parseJsonFromAiResponse,
	textLooksLikeTransaction
} from '$lib/utils/helpers';
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getExtractionPrompt, getSystemPrompt } from '../../prompts';
// Import derived stores for context only
import { lastExtractionResult } from '../conversationDerivedStores';
// Import the main app store for adding transactions and conversation store for state management
import { appStore } from '$lib/stores/AppStore';
import { conversationStore } from '../conversationStore';
import type { Transaction } from '$lib/stores/types';

// --- Helper Function for Normalizing Description ---
function normalizeDescription(desc: string | undefined | null): string {
	if (!desc) return 'unknown';
	return desc.toLowerCase().replace(/\s+/g, ' ').trim();
}

// --- Helper Function to Create a Unique Key for Transaction Data ---
function createTransactionKey(txn: Transaction): string {
	return `${txn.date || 'unknown'}-${txn.amount?.toFixed(2) || '0.00'}-${normalizeDescription(txn.description)}-${txn.direction || 'unknown'}`;
}

/**
 * Handles messages that contain new transaction data to be extracted and added.
 * Includes checks for duplicate input text and duplicate transaction data.
 * Adds new transactions to the central appStore.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleExtraction(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string; extractedCount?: number }> {
	if (!textLooksLikeTransaction(message)) {
		return { handled: false };
	}

	const lastResult = get(lastExtractionResult);
	if (
		lastResult &&
		typeof lastResult === 'object' &&
		'originalUserInput' in lastResult &&
		lastResult.originalUserInput &&
		lastResult.originalUserInput === message
	) {
		console.warn(
			'[ExtractionHandler] Input message is identical to the last processed extraction text. Preventing re-addition.'
		);
		return {
			handled: true,
			response:
				"It looks like I've already processed that exact text. Do you want to add something different?"
		};
	}

	console.log('[ExtractionHandler] Handling additional transaction data extraction.');
	conversationStore._updateStatus('Extracting more transactions...', 30);

	try {
		const today = new Date().toISOString().split('T')[0];
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: extractionPrompt }
		];

		const aiResponse = await deepseekChat(messages, { temperature: 0.2 });

		let parsedData: unknown = parseJsonFromAiResponse(aiResponse);
		let parsedTransactions: Transaction[];

		if (
			parsedData &&
			typeof parsedData === 'object' &&
			'transactions' in parsedData &&
			Array.isArray(parsedData.transactions)
		) {
			parsedTransactions = parsedData.transactions as Transaction[];
		} else if (Array.isArray(parsedData)) {
			parsedTransactions = parsedData as Transaction[];
		} else {
			console.warn(
				'[ExtractionHandler] Failed to parse a valid transaction array from AI response. Parsed data:',
				parsedData
			);
			if (
				aiResponse &&
				typeof aiResponse === 'string' &&
				!aiResponse.trim().startsWith('{') &&
				!aiResponse.trim().startsWith('[')
			) {
				console.log('[ExtractionHandler] AI response was text, letting normal handler try.');
				return { handled: false };
			}
			parsedTransactions = [];
		}

		if (parsedTransactions.length === 0) {
			console.log(
				'[ExtractionHandler] AI returned empty array or failed parse, no new transactions found.'
			);
			conversationStore._updateStatus('No new transactions found', 100);
			return {
				handled: true,
				response: "I looked through that text but couldn't find any new transactions to add."
			};
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

		if (trulyNewTransactions.length === 0) {
			console.warn(
				`[ExtractionHandler] All ${finalTransactionsPotentiallyWithDuplicates.length} extracted transaction(s) are duplicates of existing ones in the main list.`
			);
			conversationStore._updateStatus('Duplicates detected', 100);
			conversationStore._setDuplicateConfirmationNeeded(
				true,
				finalTransactionsPotentiallyWithDuplicates
			);
			conversationStore._clearLastInputContext();
			return {
				handled: true,
				response: `It looks like I've already recorded ${finalTransactionsPotentiallyWithDuplicates.length === 1 ? 'that transaction' : 'all of those transactions'}. Should I add ${finalTransactionsPotentiallyWithDuplicates.length === 1 ? 'it' : 'them'} again anyway (yes/no)?`
			};
		} else {
			const duplicateCount =
				finalTransactionsPotentiallyWithDuplicates.length - trulyNewTransactions.length;
			console.log(
				`[ExtractionHandler] Adding ${trulyNewTransactions.length} new transaction(s) to appStore. Found ${duplicateCount} duplicate(s).`
			);

			appStore.addTransactions(trulyNewTransactions);

			// *** CORRECTED CALL: Pass only the message ***
			conversationStore._setLastExtractionResult(message);

			let response = `Added ${trulyNewTransactions.length} new transaction(s).`;
			if (duplicateCount > 0) {
				response += ` (Ignored ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}).`;
			}
			response += ` Does everything look correct now?`;

			conversationStore._updateStatus('Extraction complete', 100);
			return { handled: true, response: response, extractedCount: trulyNewTransactions.length };
		}
	} catch (error) {
		console.error('[ExtractionHandler] Error during extraction:', error);
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		conversationStore._updateStatus('Error during extraction');
		conversationStore._clearLastInputContext();
		conversationStore._clearDuplicateConfirmation();
		return { handled: true, response: errorMsg };
	}
}
