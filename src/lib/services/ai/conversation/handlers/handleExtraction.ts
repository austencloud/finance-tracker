// src/lib/services/ai/conversation/handlers/handleExtraction.ts
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

// --- Import AppStore ---
import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/stores/types';

// --- Keep other necessary imports ---
import {
	applyExplicitDirection,
	// parseJsonFromAiResponse, // Not directly used here, parser does it
	textLooksLikeTransaction
} from '$lib/utils/helpers';
import { llmChat } from '../../deepseek-client';
import { getExtractionPrompt, getSystemPrompt } from '../../prompts';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { getLLMFallbackResponse } from '../../llm';

// --- Helper Functions (Normalization, Key Creation - remain the same) ---
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
		// Don't clear context here, user might still want to correct the previous identical one
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

		const aiResponse = await llmChat(messages, { temperature: 0.2 });

		// --- Pass the generated batchId to the parser ---
		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, batchId);

		if (!Array.isArray(parsedTransactions)) {
			console.warn('[ExtractionHandler] Failed to parse valid transaction array from AI response.');
			const fallback = getLLMFallbackResponse(new Error('AI response parsing failed'));
			appStore.setConversationStatus('Error parsing response');
			// --- Clear context on parse failure ---
			appStore.clearCorrectionContext();
			// --- END Context Clear ---
			return { handled: true, response: fallback };
		}

		// Handle empty extraction result
		if (parsedTransactions.length === 0) {
			console.log(
				'[ExtractionHandler] Parser returned empty array, no new transactions found or validated.'
			);
			appStore.setConversationStatus('No new transactions found', 100);
			const responseMsg =
				"I looked through that text but couldn't find any clear transactions to add.";
			// --- Set context even on zero found ---
			appStore._setConversationInternalState({
				lastUserMessageText: message,
				lastExtractionBatchId: batchId
			});
			// --- END Context Set ---
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

		// Decide how to handle duplicates and set context
		const duplicateCount =
			finalTransactionsPotentiallyWithDuplicates.length - trulyNewTransactions.length;
		let response = '';

		if (trulyNewTransactions.length > 0) {
			// Add the new ones
			console.log(
				`[ExtractionHandler] Adding ${trulyNewTransactions.length} new transaction(s). Found ${duplicateCount} duplicate(s).`
			);
			appStore.addTransactions(trulyNewTransactions); // This adds to main list & triggers analysis

			// --- Set context for the added batch ---
			appStore._setConversationInternalState({
				lastUserMessageText: message, // The user message processed
				lastExtractionBatchId: batchId // The ID of the batch *added*
			});
			// --- END Context Set ---

			response = `Added ${trulyNewTransactions.length} new transaction(s).`;
			if (duplicateCount > 0) {
				response += ` (Ignored ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}).`;
			}
			response += ` You can see them in the list now.`;
			appStore.setConversationStatus('Extraction complete', 100);
			return { handled: true, response: response, extractedCount: trulyNewTransactions.length };
		} else {
			// All were duplicates
			console.warn(
				`[ExtractionHandler] All ${finalTransactionsPotentiallyWithDuplicates.length} extracted transaction(s) are duplicates.`
			);
			appStore.setConversationStatus('Duplicates detected', 100);
			// --- Clear context if ALL were duplicates? Or keep context of the *attempt*? ---
			// Let's keep the context of the attempt, user might say "No, add them anyway" (though that needs another handler)
			// Or maybe it's better to clear it to avoid confusion? Let's clear it for now.
			appStore.clearCorrectionContext();
			// --- END Context Clear ---

			response = "It looks like I've already recorded all of those transactions.";
			// TODO: Future enhancement - Ask if user wants to add duplicates anyway?
			// If so, would need to set internal state `waitingForDuplicateConfirmation` and `pendingDuplicateTransactions`
			return { handled: true, response: response };
		}
	} catch (error) {
		console.error('[ExtractionHandler] Error during extraction:', error);
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		appStore.setConversationStatus('Error during extraction');
		// --- Clear context on error ---
		appStore.clearCorrectionContext();
		// --- END Context Clear ---
		return { handled: true, response: errorMsg };
	}
}
