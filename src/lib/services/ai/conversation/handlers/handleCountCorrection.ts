// src/lib/services/ai/conversation/handlers/handleCountCorrection.ts

import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
// --- Import specific stores ---
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
// --- Import Types ---
import type { Transaction } from '$lib/types/types'; // Adjust path if needed
// --- Import Helpers / Services ---
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers'; // Adjust path
import { getSystemPrompt, getExtractionPrompt } from '../../prompts'; // Adjust path
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser'; // Adjust path
import { applyExplicitDirection } from '$lib/utils/helpers'; // Adjust path

/**
 * Handles user messages indicating the number of transactions extracted previously was incorrect.
 * Re-runs the extraction on the original message combined with the user's correction hint.
 *
 * @param message The user's correction message (e.g., "You missed one", "There should be 3").
 * @param explicitDirectionIntent Optional direction hint.
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleCountCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();

	// --- Improved Keyword Check using Regex with Word Boundaries ---
	// Ensures we match whole words like "only", "missed", etc., not substrings.
	const countCorrectionRegex =
		/\b(missed|only|should be|there were|count is wrong|more than that|less than that|wrong number|missing one|add the other|actually \d+|expected \d+)\b/i;
	const containsCountKeyword = countCorrectionRegex.test(lowerMessage);

	// Check if the message likely refers to a quantity (contains a digit)
	const containsNumber = /\d/.test(lowerMessage);

	// --- Read relevant state directly from conversationStore ---
	const internal = get(conversationStore)._internal;
	const originalText = internal.lastUserMessageText; // Get the previous message text
	const lastBatchId = internal.lastExtractionBatchId; // Get the ID of the last extraction

	// --- Guard Clause: Exit if not a count correction or missing context ---
	// Requires a specific count keyword AND a number, plus the original text context.
	if (!containsCountKeyword || !containsNumber || !originalText || !lastBatchId) {
		return { handled: false }; // Let other handlers try
	}

	console.log('[CountCorrectionHandler] Handling count correction request.');
	// --- Set status using conversationStore action ---
	conversationStore.setStatus('Re-evaluating extraction...', 30);

	try {
		const correctionHint = message; // The user's current message is the hint
		const today = new Date().toISOString().slice(0, 10);

		// --- Prepare combined text for re-extraction ---
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
`.trim(); // Added more specific instruction

		// Use the standard extraction prompt with the combined text
		const extractionPrompt = getExtractionPrompt(combinedText, today);
		const messages = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			{ role: 'user' as const, content: extractionPrompt }
		];

		// --- Call LLM for re-extraction ---
		// Use the more capable model for this complex re-evaluation
		const aiResponse = await llmChat(messages, {
			temperature: 0.2,
			rawUserText: combinedText, // Pass combined text for context
			requestJsonFormat: true, // Request JSON format
			forceHeavy: true // Use the more capable model
		});

		// --- Parse and Process Re-extracted Transactions ---
		const newBatchId = uuidv4();
		const parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, newBatchId);

		if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
			console.warn(
				'[CountCorrectionHandler] AI did not find any transactions after correction hint.'
			);
			// Use conversationStore action
			conversationStore.setStatus('Correction failed', 100);
			// Throw a more user-friendly error message
			throw new Error(
				"I tried again based on your correction, but still couldn't find clear transactions in the original text."
			);
		}

		// Apply explicit direction override if provided
		const correctedTransactions = applyExplicitDirection(
			parsedTransactions,
			explicitDirectionIntent
		).map((txn) => ({
			...txn,
			batchId: newBatchId // Ensure all transactions have the new batch ID
		}));

		// --- Add corrected transactions using transactionStore action ---
		// Note: Consider removing transactions from the *previous* batchId first
		// if this correction should *replace* the previous extraction.
		// Example (add this logic if needed):
		// transactionStore.removeByBatchId(lastBatchId);
		transactionStore.add(correctedTransactions);

		// --- Update conversation state using conversationStore actions ---
		conversationStore.setStatus('Extraction updated', 100);
		// Clear the context associated with the *original* message now that it's corrected
		conversationStore.clearCorrectionContext();

		// --- Return Success Response ---
		return {
			handled: true,
			response: `Okay, I've re-analyzed and added/updated ${correctedTransactions.length} transaction(s) based on your correction. Please check the list.`
		};
	} catch (err) {
		console.error('[CountCorrectionHandler] Error during re-extraction:', err);
		// --- Update conversation state on error ---
		conversationStore.setStatus('Error during correction');
		conversationStore.clearCorrectionContext(); // Clear context on error

		return {
			handled: true, // Still handled (by error)
			response: getLLMFallbackResponse(err instanceof Error ? err : undefined)
		};
	}
}
