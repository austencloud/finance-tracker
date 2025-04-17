// src/lib/services/ai/conversation/handlers/correctionHandler.ts
import { createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { categories as categoryStore } from '$lib/stores/categoryStore';
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import type { Transaction, Category } from '$lib/types/types';
import type { HandlerContext } from './types';
import { getSystemPrompt } from '../../prompts/systemPrompts';
import { getCorrectionParsingPrompt } from '../../prompts/correctionPrompts';

/**
 * Handler for user messages attempting to correct a previously extracted transaction.
 * Identifies the target transaction, calls LLM to parse the correction, then updates it.
 */
export const correctionHandler = createConditionalHandler(
	{
		// Keywords and patterns that indicate correction intent
		regex: [
			/\b(actually|meant|instead|rather|sorry|correct|update|change|fix|no it was|no the)\b/i
		],
		// Additional check for numbers, as corrections often involve values
		customCheck: (message) => {
			const containsNumber = /\d/.test(message);
			const internal = get(conversationStore)._internal;
			const txnId = internal.lastCorrectionTxnId;
			const batchId = internal.lastExtractionBatchId;
			return Boolean(containsNumber || txnId || batchId);
		}
	},
	async (context: HandlerContext) => {
		const { message, explicitDirectionIntent } = context;

		// Get context from conversation store
		const internal = get(conversationStore)._internal;
		const batchId = internal.lastExtractionBatchId;
		let txnId = internal.lastCorrectionTxnId;

		// If no specific transaction is in correction context,
		// check if the last extraction batch contained exactly one transaction
		if (!txnId && batchId) {
			const txnsInBatch = get(transactionStore).filter((t: Transaction) => t.batchId === batchId);
			if (txnsInBatch.length === 1) {
				txnId = txnsInBatch[0].id;
				console.log(
					`[CorrectionHandler] Auto-selected transaction ${txnId} from batch ${batchId} for correction.`
				);
			}
		}

		// If we still don't have a specific transaction ID, we cannot proceed reliably
		if (!txnId) {
			console.log(
				'[CorrectionHandler] No specific transaction context found. Passing to next handler.'
			);
			// Return handled: false to allow other handlers (like extraction) to process
			return { handled: false };
		}

		// Set processing status
		conversationStore.setStatus('Applying your correction...', 30);

		try {
			const today = new Date().toISOString().slice(0, 10);
			const sysPrompt = getSystemPrompt(today);

			// Find the transaction object
			const transactionToCorrect = get(transactionStore).find((t: Transaction) => t.id === txnId);

			// Handle case where transaction might have been deleted
			if (!transactionToCorrect) {
				console.error(`[CorrectionHandler] Transaction with ID ${txnId} not found in store.`);
				conversationStore.setStatus('Error: Original transaction not found');
				conversationStore.clearCorrectionContext();

				return {
					response: "Sorry, I couldn't find the transaction you wanted to correct anymore."
				};
			}

			// Get available categories for validation
			const availableCategories = get(categoryStore);

			// Prepare prompt for LLM correction parsing
			const correctionPrompt = getCorrectionParsingPrompt(
				message,
				transactionToCorrect,
				availableCategories
			);

			// Call LLM
			const aiResp = await llmChat(
				[
					{ role: 'system', content: sysPrompt },
					{ role: 'user', content: correctionPrompt }
				],
				{ temperature: 0.1, rawUserText: message, requestJsonFormat: true }
			);

			// Parse LLM response
			const cleaned = aiResp.trim().replace(/^```json\s*|```$/g, '');
			let parsedCorrection: {
				id?: string;
				field_updates?: Record<string, any>;
				correction_possible?: boolean;
			};

			try {
				parsedCorrection = JSON.parse(cleaned);
			} catch (parseError) {
				console.error(
					'[CorrectionHandler] Failed to parse LLM JSON:',
					parseError,
					'\nRaw response:',
					aiResp
				);
				throw new Error('AI response for correction was not valid JSON.');
			}

			// Check if LLM indicated a correction is possible and provided updates
			if (
				!parsedCorrection.correction_possible ||
				!parsedCorrection.field_updates ||
				Object.keys(parsedCorrection.field_updates).length === 0
			) {
				console.log('[CorrectionHandler] LLM indicated no correction possible or no fields found.');
				conversationStore.setStatus('', 0);

				return {
					response:
						"I didn't detect any specific correction in your message. What would you like to change about this transaction?"
				};
			}

			const field_updates = parsedCorrection.field_updates;

			// Apply explicit direction if provided (overrides what LLM found)
			if (explicitDirectionIntent) {
				field_updates.direction = explicitDirectionIntent;
			}

			// Validate/sanitize updates
			// Amount validation
			if (field_updates.hasOwnProperty('amount')) {
				const parsedAmount = parseFloat(field_updates.amount);
				if (isNaN(parsedAmount) || parsedAmount < 0) {
					console.warn(
						`[CorrectionHandler] Invalid amount: ${field_updates.amount}. Ignoring update.`
					);
					delete field_updates.amount;
				} else {
					field_updates.amount = parsedAmount;
				}
			}

			// Date validation
			if (field_updates.hasOwnProperty('date')) {
				const resolvedDate = resolveAndFormatDate(field_updates.date);
				if (resolvedDate === 'unknown' || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
					console.warn(`[CorrectionHandler] Invalid date: ${field_updates.date}. Ignoring update.`);
					delete field_updates.date;
				} else {
					field_updates.date = resolvedDate;
				}
			}

			// Category validation
			if (field_updates.hasOwnProperty('category')) {
				if (!availableCategories.includes(field_updates.category as Category)) {
					console.warn(
						`[CorrectionHandler] Invalid category: ${field_updates.category}. Ignoring update.`
					);
					delete field_updates.category;
				}
			}

			// If no valid updates remain after validation
			if (Object.keys(field_updates).length === 0) {
				console.log('[CorrectionHandler] No valid field updates after validation.');
				conversationStore.setStatus('', 0);

				return {
					response:
						"Sorry, I couldn't apply that correction. Could you try phrasing it differently?"
				};
			}

			// Create the updated transaction by merging original and updates
			const updatedTxn: Transaction = { ...transactionToCorrect, ...field_updates };

			// Update the transaction in the store
			transactionStore.update(updatedTxn);
			conversationStore.setStatus('Transaction updated', 100);

			// Keep transaction ID in context for potential follow-up corrections
			conversationStore._setInternalState({
				lastCorrectionTxnId: updatedTxn.id
			});

			// Format confirmation message
			const updates = Object.entries(field_updates)
				.map(([k, v]) => `${k}: ${v}`)
				.join(', ');

			return {
				response: `✅ Updated "${transactionToCorrect.description}" (${updates}). Anything else?`
			};
		} catch (err) {
			console.error('[CorrectionHandler] Error:', err);
			conversationStore.setStatus('Error applying correction');
			conversationStore.clearCorrectionContext();

			return {
				response: getLLMFallbackResponse(err instanceof Error ? err : undefined)
			};
		}
	}
);

// Legacy export for backward compatibility during migration
export async function handleCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return correctionHandler({
		message,
		explicitDirectionIntent
	});
}
