// src/lib/services/ai/conversation/handlers/countCorrectionHandler.ts
import { createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers';
import { getSystemPrompt, getExtractionPrompt } from '../../prompts';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { applyExplicitDirection } from '$lib/utils/helpers';
import type { HandlerContext } from './types';
import type { Transaction } from '$lib/types/types';

/**
 * Handler for messages indicating the number of transactions extracted was incorrect.
 * For example: "You missed one", "There should be 3 transactions", etc.
 */
export const countCorrectionHandler = createConditionalHandler(
	{
		// Regex patterns for detecting count correction intent
		regex: [
			/\b(missed|only|should be|there were|count is wrong|more than that|less than that|wrong number|missing one|add the other|actually \d+|expected \d+)\b/i
		],
		// Custom function to check if message likely refers to transaction count
		customCheck: (message) => {
			// Check if message contains numbers (likely referring to quantity)
			const containsNumber = /\d/.test(message);

			// Check if we have the context needed (previous message and batch ID)
			const internal = get(conversationStore)._internal;
			const hasOriginalContext = !!(internal.lastUserMessageText && internal.lastExtractionBatchId);

			return containsNumber && hasOriginalContext;
		}
	},
	async (context: HandlerContext) => {
		const { message, explicitDirectionIntent } = context;

		console.log('[CountCorrectionHandler] Handling count correction request.');
		conversationStore.setStatus('Re-evaluating extraction...', 30);

		try {
			// Get original message context
			const internal = get(conversationStore)._internal;
			const originalText = internal.lastUserMessageText;
			const lastBatchId = internal.lastExtractionBatchId;

			// Sanity check (should be covered by customCheck, but being defensive)
			if (!originalText || !lastBatchId) {
				console.warn('[CountCorrectionHandler] Missing context for count correction.');
				return {
					response:
						"I'm not sure which transaction data you're referring to. Could you provide the complete information again?"
				};
			}

			const correctionHint = message;
			const today = new Date().toISOString().slice(0, 10);

			// Prepare combined text with the original and the correction
			const combinedText = `
Original user input:
"""
${originalText}
"""
Correction / Hint about transaction count:
"""
${correctionHint}
"""
Please re-analyze the ORIGINAL user input based on the correction/hint provided and extract ALL relevant transactions accurately according to the number mentioned in the correction hint.
`.trim();

			// Prepare prompt and call LLM
			const extractionPrompt = getExtractionPrompt(combinedText, today);
			const messages = [
				{ role: 'system' as const, content: getSystemPrompt(today) },
				{ role: 'user' as const, content: extractionPrompt }
			];

			// Call LLM with more capable model for complex corrections
			const aiResponse = await llmChat(messages, {
				temperature: 0.2,
				rawUserText: combinedText,
				requestJsonFormat: true,
				forceHeavy: true // Use more capable model
			});

			// Parse and process transactions
			const newBatchId = uuidv4();
			const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, newBatchId);

			if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
				console.warn('[CountCorrectionHandler] AI found no transactions after correction.');
				conversationStore.setStatus('Correction failed', 100);
				throw new Error(
					"I tried again based on your correction, but still couldn't find clear transactions in the original text."
				);
			}

			// Apply direction override if provided
			const correctedTransactions = applyExplicitDirection(
				parsedTransactions,
				explicitDirectionIntent
			).map((txn) => ({
				...txn,
				batchId: newBatchId
			}));

			// Update conversation state
			conversationStore.setStatus('Extraction updated', 100);
			conversationStore.clearCorrectionContext();

			// Return success with transactions to be added by middleware
			return {
				response: `Okay, I've re-analyzed and found ${correctedTransactions.length} transaction(s) based on your correction. Please check the list.`,
				transactions: correctedTransactions
			};
		} catch (err) {
			console.error('[CountCorrectionHandler] Error during re-extraction:', err);
			conversationStore.setStatus('Error during correction');
			conversationStore.clearCorrectionContext();

			return {
				response: getLLMFallbackResponse(err instanceof Error ? err : undefined)
			};
		}
	}
);

// Legacy export for backward compatibility during migration
export async function handleCountCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return countCorrectionHandler({
		message,
		explicitDirectionIntent
	});
}
