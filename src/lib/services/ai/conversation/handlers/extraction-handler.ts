// src/lib/services/ai/conversation/handlers/extraction-handler.ts
import { get } from 'svelte/store';
import {
	applyExplicitDirection,
	parseJsonFromAiResponse,
	textLooksLikeTransaction
} from '$lib/utils/helpers';
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getExtractionPrompt, getSystemPrompt } from '../../prompts';
import { lastExtractionResult, extractedTransactions } from '../conversationDerivedStores';
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

		// --- PARSE AND VALIDATE RESPONSE ---
		let parsedData: unknown = parseJsonFromAiResponse(aiResponse); // Use unknown type initially
		let parsedTransactions: Transaction[]; // Declare variable to hold the final array

		// Check if the parsed data is the expected structure { transactions: [...] } or just [...]
		if (
			parsedData &&
			typeof parsedData === 'object' &&
			'transactions' in parsedData &&
			Array.isArray(parsedData.transactions)
		) {
			parsedTransactions = parsedData.transactions as Transaction[];
		} else if (Array.isArray(parsedData)) {
			// Handle cases where the AI returns just the array
			parsedTransactions = parsedData as Transaction[];
		} else {
			// Parsing failed or returned unexpected structure
			console.warn(
				'[ExtractionHandler] Failed to parse a valid transaction array from AI response. Parsed data:',
				parsedData
			);
			// Optionally check if aiResponse was non-JSON text and return { handled: false }
			if (
				aiResponse &&
				typeof aiResponse === 'string' &&
				!aiResponse.trim().startsWith('{') &&
				!aiResponse.trim().startsWith('[')
			) {
				console.log('[ExtractionHandler] AI response was text, letting normal handler try.');
				return { handled: false };
			}
			// Treat as extraction failure (0 transactions)
			parsedTransactions = [];
			// Could also throw: throw new Error('AI did not return a valid transaction array.');
		}
		// --- END PARSE AND VALIDATE ---

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

		// Apply explicit direction (safe now because parsedTransactions is guaranteed to be an array)
		let finalTransactionsPotentiallyWithDuplicates = applyExplicitDirection(
			parsedTransactions,
			explicitDirectionIntent
		);

		// --- DUPLICATE TRANSACTION DATA CHECK ---
		const currentExtracted = get(extractedTransactions);
		const existingKeys = new Set(currentExtracted.map(createTransactionKey));

		// Filter the newly parsed transactions
		const trulyNewTransactions = finalTransactionsPotentiallyWithDuplicates.filter(
			(newTxn) => !existingKeys.has(createTransactionKey(newTxn))
		);
		// --- END DUPLICATE TRANSACTION DATA CHECK ---

		if (trulyNewTransactions.length === 0) {
			console.warn(
				`[ExtractionHandler] All ${finalTransactionsPotentiallyWithDuplicates.length} extracted transaction(s) are duplicates of existing ones.`
			);
			conversationStore._updateStatus('Duplicates detected', 100);
			conversationStore._clearLastInputContext();
			return {
				handled: true,
				response:
					"It looks like I've already recorded all of those transactions. Did you want to add something else?"
			};
		} else {
			const duplicateCount =
				finalTransactionsPotentiallyWithDuplicates.length - trulyNewTransactions.length;
			console.log(
				`[ExtractionHandler] Adding ${trulyNewTransactions.length} new transaction(s). Found ${duplicateCount} duplicate(s).`
			);

			conversationStore._setLastExtractionResult(
				trulyNewTransactions,
				message,
				explicitDirectionIntent
			);

			conversationStore._addTransactions(trulyNewTransactions);

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
		return { handled: true, response: errorMsg };
	}
}
