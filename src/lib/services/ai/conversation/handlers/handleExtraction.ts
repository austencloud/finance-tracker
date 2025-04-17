import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/types/types';
import {
	applyExplicitDirection,
	textLooksLikeTransaction,
	parseJsonFromAiResponse
} from '$lib/utils/helpers';
import { getExtractionPrompt, getSplitItemDescriptionPrompt, getSystemPrompt } from '../../prompts';
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

	// Regex to detect "split" or "splitting" followed by currency/amount
	// Captures: 1=Amount string, 2=Optional 'k'/'K' suffix
	const splitRegex =
		/\bsplit(?:ting)?\b(?:.*?)(?:[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b)?\s?((?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?))\s?([kK])?/i;
	const splitMatch = message.match(splitRegex);
	const today = new Date().toISOString().split('T')[0]; // Today's date for context

	if (splitMatch && splitMatch.index !== undefined) {
		// Attempt to parse the total amount mentioned in the split
		let amountStr = splitMatch[1].replace(/,/g, ''); // Remove commas from amount string
		const kSuffix = splitMatch[2]; // Check for 'k' suffix
		if (kSuffix) {
			// Convert 'k' suffix to thousands
			const num = parseFloat(amountStr);
			amountStr = isNaN(num) ? amountStr : (num * 1000).toString();
		}
		const total = parseFloat(amountStr);

		// If a valid total amount was parsed...
		if (!isNaN(total)) {
			// --- Use LLM to get a better description for the split item ---
			let contextDescription = 'Shared Item'; // Default fallback description
			try {
				console.log('[handleExtraction] Split detected, asking LLM for item description...');
				const descPrompt = getSplitItemDescriptionPrompt(message);
				// Use a potentially faster/simpler model for this focused task
				const llmDescResponse = await llmChat([{ role: 'user', content: descPrompt }], {
					temperature: 0.1,
					forceSimple: true // Request simpler model if configured
				});

				// Use LLM response if valid and not the generic fallback
				if (
					llmDescResponse &&
					llmDescResponse.trim() &&
					llmDescResponse.trim().toLowerCase() !== 'shared item'
				) {
					// Basic Title Case formatting
					contextDescription = llmDescResponse
						.trim()
						.toLowerCase()
						.split(' ')
						.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
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
				contextDescription = 'Shared Item'; // Fallback on error
			}
			// --- End LLM Description Context ---

			// Detect currency from the original match or default to USD
			const currencyMatch = splitMatch[0].match(
				/[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b/i
			);
			const detectedCurrency = currencyMatch ? currencyMatch[0].toUpperCase() : 'USD';

			// Resolve date from original message (defaults to today if needed)
			const contextDate = resolveAndFormatDate(message);

			// Store the context and set the state to wait for the user's share amount
			appStore.setWaitingForSplitBillShare({
				totalAmount: total,
				currency: detectedCurrency,
				originalMessage: message,
				possibleDate: contextDate,
				description: contextDescription // Store the determined description
			});

			// Ask the user for their share, providing context
			appStore.addConversationMessage(
				'assistant',
				`You mentioned splitting "${contextDescription}" (total approx. ${total} ${detectedCurrency}). How much was *your* specific share (just the number)?`
			);
			appStore.setConversationStatus('Awaiting split-bill share', 100); // Update status

			// Return handled: true to stop further processing by other handlers
			return { handled: true, response: '' };
		} else {
			// Log if split was detected but amount parsing failed (should be rare)
			console.warn(
				'[ExtractionHandler] Split detected, but could not parse total amount from:',
				splitMatch[0]
			);
			// Allow falling through to general extraction in this unlikely case
		}
	}
	// --- End Split Bill Handling ---

	// --- Step 2: General Transaction Extraction (If not handled as split) ---

	// Basic check if the message looks like it might contain transaction info
	if (!textLooksLikeTransaction(message)) {
		return { handled: false }; // Let other handlers (like handleNormalResponse) take over
	}

	// Prevent re-processing identical messages consecutively
	const lastProcessedMessage = get(appStore).conversation._internal.lastUserMessageText;
	if (lastProcessedMessage && lastProcessedMessage === message) {
		console.warn('[ExtractionHandler] Input message identical to last. Preventing re-addition.');
		appStore.addConversationMessage(
			'assistant',
			"It looks like I've already processed that exact text."
		);
		return { handled: true, response: '' };
	}

	console.log('[ExtractionHandler] Handling general transaction data extraction.');
	appStore.setConversationStatus('Extracting transactions...', 30);

	const batchId = uuidv4(); // Unique ID for this extraction batch
	console.log(`[ExtractionHandler] Generated batchId: ${batchId}`);

	try {
		// Prepare prompt and call LLM for extraction
		const extractionPrompt = getExtractionPrompt(message, today);
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: extractionPrompt }
		];
		let aiResponse = await llmChat(messages, { temperature: 0.2, rawUserText: message });

		// Parse the LLM's JSON response (parser now uses resolveAndFormatDate)
		let parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, batchId);

		// Optional: Log if LLM found fewer transactions than expected based on 'and' clauses
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
				`[Extraction] Found ${parsedTransactions.length} valid transactions out of approximately ${estimateClauses} mentioned.`
			);
		} else if (Array.isArray(parsedTransactions) && parsedTransactions.length === 0) {
			console.warn(`[Extraction] No transactions parsed by LLM from: "${message}"`);
			// Consider if a retry is needed here, or just report failure
		}

		// Handle potential parsing failures or empty results
		if (!Array.isArray(parsedTransactions)) {
			console.warn('[ExtractionHandler] Failed to parse valid transaction array from AI response.');
			const fallback = getLLMFallbackResponse(new Error('AI response parsing failed'));
			appStore.setConversationStatus('Error parsing response');
			appStore.clearCorrectionContext();
			return { handled: true, response: fallback };
		}

		// --- Check for Clarification Needs (e.g., "$X in ETH") ---
		const transactionsToAdd: Transaction[] = [];
		let needsAssetClarification = false;
		let clarificationMessage = ''; // Store the first clarification question found

		for (const txn of parsedTransactions) {
			// Check if the parser/LLM added the needs_clarification flag
			if (txn.needs_clarification) {
				needsAssetClarification = true;
				if (!clarificationMessage) clarificationMessage = txn.needs_clarification; // Store the first question
				console.log(
					`[ExtractionHandler] Transaction needs clarification: ${txn.needs_clarification}`
				);
				// Don't add this transaction to transactionsToAdd yet
			} else {
				// Add transactions that *don't* need clarification
				transactionsToAdd.push(txn);
			}
		}

		// --- Add Clear Transactions & Handle Clarification Request ---
		let addedCount = 0;
		let response = '';

		// Add the transactions that *don't* need clarification first
		if (transactionsToAdd.length > 0) {
			let finalNonAmbiguous = applyExplicitDirection(transactionsToAdd, explicitDirectionIntent);
			// Deduplicate before adding
			const currentMainTransactions = get(appStore).transactions;
			const existingKeys = new Set(currentMainTransactions.map(createTransactionKey));
			const trulyNewNonAmbiguous = finalNonAmbiguous.filter(
				(newTxn) => !existingKeys.has(createTransactionKey(newTxn))
			);

			if (trulyNewNonAmbiguous.length > 0) {
				appStore.addTransactions(trulyNewNonAmbiguous);
				addedCount = trulyNewNonAmbiguous.length;
				response = `Added ${addedCount} transaction(s). `;
			}
		}

		// If *any* transaction needed clarification, ask the question and stop
		if (needsAssetClarification && clarificationMessage) {
			appStore.addConversationMessage('assistant', clarificationMessage);
			appStore.setConversationStatus('Awaiting clarification', 100);
			// Store context that this message needs follow-up
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			// Respond, potentially mentioning transactions that *were* added
			return {
				handled: true,
				response: addedCount > 0 ? response + 'Waiting for clarification on another item.' : ''
			};
		}

		// --- Handle cases where nothing was added (all duplicates, empty, or only clarification needed) ---
		if (addedCount === 0) {
			if (parsedTransactions.length > 0) {
				// Parsed something, but all were duplicates or needed clarification
				console.warn(
					`[ExtractionHandler] All extracted transaction(s) were duplicates or needed clarification.`
				);
				appStore.setConversationStatus('Duplicates detected / Clarification needed', 100);
				appStore.clearCorrectionContext(); // Clear correction context if it was a duplicate
				response = "It looks like I've already recorded those transactions or need more details.";
			} else {
				// LLM returned empty array
				console.log('[ExtractionHandler] LLM returned empty array, no transactions found.');
				appStore.setConversationStatus('No new transactions found', 100);
				response = "I looked through that text but couldn't find any clear transactions to add.";
			}
			// Store context even if nothing added, to prevent immediate re-processing
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			return { handled: true, response: response };
		}

		// --- If transactions were added and no clarification needed ---
		appStore._setConversationInternalState({
			lastUserMessageText: message,
			lastExtractionBatchId: batchId
		});
		response += `You can see them in the list now.`;
		appStore.setConversationStatus('Extraction complete', 100);
		return { handled: true, response: response, extractedCount: addedCount };
	} catch (error) {
		// General error handling for the extraction process
		console.error('[ExtractionHandler] Error during extraction:', error);
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		appStore.setConversationStatus('Error during extraction');
		appStore.clearCorrectionContext(); // Clear context on error
		return { handled: true, response: errorMsg };
	}
}
