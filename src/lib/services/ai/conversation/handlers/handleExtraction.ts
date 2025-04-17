// src/lib/services/ai/conversation/handlers/handleExtraction.ts
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

// --- Import specific stores ---
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';

// --- Import Types ---
import type { Transaction } from '$lib/types/types'; // Adjust path if needed

// --- Import Helpers / Services ---
import {
	applyExplicitDirection,
	textLooksLikeTransaction,
	// parseJsonFromAiResponse, // Not used directly here, parser handles it
	formatCurrency
} from '$lib/utils/helpers'; // Adjust path if needed
import { getExtractionPrompt, getSystemPrompt, getSplitItemDescriptionPrompt } from '../../prompts'; // Adjust path if needed
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser'; // Adjust path if needed
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers'; // Adjust path if needed
import { resolveAndFormatDate } from '$lib/utils/date'; // Adjust path if needed
// Removed categorizeTransaction import as it's handled elsewhere or not needed here

// --- Helper Functions ---

// Normalizes description for consistent key generation
function normalizeDescription(desc: string | undefined | null): string {
	if (!desc) return 'unknown';
	return desc.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Creates a unique key for a transaction to help with deduplication
// ** UPDATED to include currency **
function createTransactionKey(txn: Transaction): string {
	const amountStr = typeof txn.amount === 'number' ? txn.amount.toFixed(2) : '0.00';
	// Include currency in the key for multi-currency uniqueness
	return `${txn.date || 'unknown'}-${amountStr}-${txn.currency?.toUpperCase() || 'USD'}-${normalizeDescription(
		txn.description
	)}-${txn.direction || 'unknown'}`;
}

/**
 * Handles extracting transactions from user messages.
 * Prioritizes detecting split bills and asking for clarification.
 * Falls back to general LLM extraction for non-split messages.
 * Also handles checking for asset clarification needs (e.g., "$X in ETH").
 */
export async function handleExtraction(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string; extractedCount?: number }> {
	// --- Step 1: Check for Split Bill Scenario ---
	const splitRegex =
		/\bsplit(?:ting)?\b(?:.*?)(?:[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b)?\s?((?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?))\s?([kK])?/i;
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
			// --- Use LLM to get description context ---
			let contextDescription = 'Shared Item'; // Default
			try {
				console.log('[handleExtraction] Split detected, asking LLM for item description...');
				const descPrompt = getSplitItemDescriptionPrompt(message);
				const llmDescResponse = await llmChat([{ role: 'user', content: descPrompt }], {
					temperature: 0.1,
					forceSimple: true
				});
				if (
					llmDescResponse &&
					llmDescResponse.trim() &&
					llmDescResponse.trim().toLowerCase() !== 'shared item'
				) {
					contextDescription = llmDescResponse
						.trim()
						.toLowerCase()
						.split(' ')
						.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
						.join(' ');
					console.log(
						`[handleExtraction] LLM suggested split description: "${contextDescription}"`
					);
				} else {
					console.warn(
						"[handleExtraction] LLM couldn't provide specific split description, using default."
					);
				}
			} catch (err) {
				console.error('[handleExtraction] Error getting split description from LLM:', err);
				contextDescription = 'Shared Item'; // Fallback
			}

			const currencyMatch = splitMatch[0].match(
				/[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b/i
			);
			const detectedCurrency = currencyMatch ? currencyMatch[0].toUpperCase() : 'USD';
			const contextDate = resolveAndFormatDate(message); // Resolve date

			// --- Set state using conversationStore actions ---
			conversationStore.setWaitingForSplitBillShare({
				totalAmount: total,
				currency: detectedCurrency,
				originalMessage: message,
				possibleDate: contextDate,
				description: contextDescription
			});
			conversationStore.addMessage(
				'assistant',
				`You mentioned splitting "${contextDescription}" (total approx. ${total} ${detectedCurrency}). How much was *your* specific share (just the number)?`
			);
			conversationStore.setStatus('Awaiting split-bill share', 100);

			return { handled: true, response: '' }; // Stop processing here
		} else {
			console.warn(
				'[ExtractionHandler] Split detected, but could not parse total amount from:',
				splitMatch[0]
			);
		}
	}
	// --- End Split Bill Handling ---

	// --- Step 2: General Transaction Extraction (If not handled as split) ---
	if (!textLooksLikeTransaction(message)) {
		return { handled: false };
	}

	// --- Read state using get() on specific stores ---
	const internalState = get(conversationStore)._internal;
	const lastProcessedMessage = internalState.lastUserMessageText;

	// Prevent re-processing identical messages
	if (lastProcessedMessage && lastProcessedMessage === message) {
		console.warn('[ExtractionHandler] Input message identical to last.');
		// Use conversationStore action
		conversationStore.addMessage(
			'assistant',
			"It looks like I've already processed that exact text."
		);
		return { handled: true, response: '' };
	}

	console.log('[ExtractionHandler] Handling general transaction data extraction.');
	// --- Use conversationStore action ---
	conversationStore.setStatus('Extracting transactions...', 30);

	const batchId = uuidv4();
	console.log(`[ExtractionHandler] Generated batchId: ${batchId}`);

	try {
		// Prepare prompt and call LLM
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: extractionPrompt }
		];
		let aiResponse = await llmChat(messages, { temperature: 0.2, rawUserText: message });

		// Parse response (parser uses resolveAndFormatDate)
		let parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, batchId);

		// Log if fewer transactions found than expected (optional)
		const estimateClauses = message
			.split(/\band\b/i)
			.map((s) => s.trim())
			.filter(Boolean).length;
		if (
			Array.isArray(parsedTransactions) &&
			parsedTransactions.length > 0 &&
			parsedTransactions.length < estimateClauses
		) {
			console.log(
				`[Extraction] Found ${parsedTransactions.length} of ~${estimateClauses} expected transactions.`
			);
		} else if (Array.isArray(parsedTransactions) && parsedTransactions.length === 0) {
			console.warn(`[Extraction] No transactions parsed by LLM from: "${message}"`);
		}

		// Handle parsing failure
		if (!Array.isArray(parsedTransactions)) {
			console.warn('[ExtractionHandler] Failed to parse valid transaction array from AI response.');
			const fallback = getLLMFallbackResponse(new Error('AI response parsing failed'));
			conversationStore.setStatus('Error parsing response');
			conversationStore.clearCorrectionContext(); // Use specific action
			return { handled: true, response: fallback };
		}

		// --- Check for Asset Clarification Needs ---
		const transactionsToAdd: Transaction[] = [];
		let needsAssetClarification = false;
		let clarificationMessage = '';

		for (const txn of parsedTransactions) {
			if (txn.needs_clarification) {
				// Check flag from parser/LLM
				needsAssetClarification = true;
				if (!clarificationMessage) clarificationMessage = txn.needs_clarification;
				console.log(
					`[ExtractionHandler] Transaction needs clarification: ${txn.needs_clarification}`
				);
			} else {
				transactionsToAdd.push(txn);
			}
		}

		// --- Add Clear Transactions & Handle Clarification Request ---
		let addedCount = 0;
		let response = '';

		if (transactionsToAdd.length > 0) {
			let finalNonAmbiguous = applyExplicitDirection(transactionsToAdd, explicitDirectionIntent);
			// Deduplicate before adding
			// --- Read transactions from transactionStore ---
			const currentMainTransactions = get(transactionStore);
			const existingKeys = new Set(currentMainTransactions.map(createTransactionKey)); // Uses updated key function
			const trulyNewNonAmbiguous = finalNonAmbiguous.filter(
				(newTxn) => !existingKeys.has(createTransactionKey(newTxn))
			);

			if (trulyNewNonAmbiguous.length > 0) {
				// --- Use transactionStore action ---
				transactionStore.add(trulyNewNonAmbiguous);
				addedCount = trulyNewNonAmbiguous.length;
				response = `Added ${addedCount} transaction(s). `;
			}
		}

		// If clarification needed, ask and stop
		if (needsAssetClarification && clarificationMessage) {
			conversationStore.addMessage('assistant', clarificationMessage);
			conversationStore.setStatus('Awaiting clarification', 100);
			// --- Use conversationStore action ---
			conversationStore._setInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			return {
				handled: true,
				response: addedCount > 0 ? response + 'Waiting for clarification on another item.' : ''
			};
		}

		// --- Handle cases where nothing new was added ---
		if (addedCount === 0) {
			if (parsedTransactions.length > 0) {
				// Parsed but all duplicates/clarification needed
				console.warn(
					`[ExtractionHandler] All extracted transaction(s) were duplicates or needed clarification.`
				);
				conversationStore.setStatus('Duplicates detected / Clarification needed', 100);
				conversationStore.clearCorrectionContext();
				response = "It looks like I've already recorded those transactions or need more details.";
			} else {
				// LLM returned empty
				console.log('[ExtractionHandler] LLM returned empty array.');
				conversationStore.setStatus('No new transactions found', 100);
				response = "I looked through that text but couldn't find any clear transactions to add.";
			}
			conversationStore._setInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			return { handled: true, response: response };
		}

		// --- Success: Transactions added, no clarification needed ---
		conversationStore._setInternalState({
			lastUserMessageText: message,
			lastExtractionBatchId: batchId
		});
		response += `You can see them in the list now.`;
		conversationStore.setStatus('Extraction complete', 100);
		return { handled: true, response: response, extractedCount: addedCount };
	} catch (error) {
		// General error handling
		console.error('[ExtractionHandler] Error during extraction:', error);
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		conversationStore.setStatus('Error during extraction');
		conversationStore.clearCorrectionContext();
		return { handled: true, response: errorMsg };
	}
}
