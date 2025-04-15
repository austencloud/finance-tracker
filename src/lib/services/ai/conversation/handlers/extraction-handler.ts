// src/lib/services/ai/conversation/handlers/extraction-handler.ts
import { get } from 'svelte/store'; // Import 'get' from svelte/store
import {
	applyExplicitDirection,
	parseJsonFromAiResponse,
	textLooksLikeTransaction
} from '$lib/utils/helpers'; // Import helper
import { deepseekChat, getFallbackResponse } from '../../deepseek-client'; // Import AI client and fallback
import { getExtractionPrompt, getSystemPrompt } from '../../prompts';
import { lastExtractionResult } from '../conversationDerivedStores'; // Import derived store for context
import { conversationStore } from '../conversationStore';
import type { Transaction } from '$lib/types/transactionTypes';

/**
 * Handles messages that contain new transaction data to be extracted and added,
 * *after* the initial data has already been processed or if the input wasn't caught by initial/bulk handlers.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint from the service.
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleExtraction(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string; extractedCount?: number }> {
	// Added extractedCount to return type
	// Condition: Does the message look like transaction data?
	// And it wasn't handled by initial/bulk/correction handlers.
	if (!textLooksLikeTransaction(message)) {
		return { handled: false };
	}

	// Avoid re-processing the exact same input as the last extraction
	const lastResult = get(lastExtractionResult);
	// Check if lastResult has the expected property and is identical to the current message
	if (
		lastResult &&
		typeof lastResult === 'object' &&
		'originalUserInput' in lastResult &&
		lastResult.originalUserInput === message
	) {
		console.warn(
			'[ExtractionHandler] Input message is identical to the last processed extraction. Skipping.'
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

		// Corrected type: Allow null initially
		let parsedTransactions: Transaction[] | null =
			parseJsonFromAiResponse<Transaction[]>(aiResponse);

		if (!parsedTransactions) {
			// Handle case where parsing failed (parseJsonFromAiResponse returns null)
			console.warn('[ExtractionHandler] Failed to parse JSON response from AI.');
			// Attempt to check if the raw response might contain useful text anyway
			if (aiResponse && aiResponse.trim().length > 0 && !aiResponse.trim().startsWith('{')) {
				// If it's not JSON-like, maybe it's a text response?
				// Let the normal response handler try it.
				return { handled: false }; // Let it fall through to normal handler
			}
			// If it was likely meant to be JSON but failed, throw error
			throw new Error('AI did not return valid JSON.');
		}

		if (parsedTransactions.length === 0) {
			console.log('[ExtractionHandler] AI returned empty array, likely no new transactions found.');
			conversationStore._updateStatus('No new transactions found', 100);
			return {
				handled: true,
				response: "I looked through that text but couldn't find any new transactions to add."
			};
		}

		// Apply explicit direction if provided
		let finalTransactions = applyExplicitDirection(parsedTransactions, explicitDirectionIntent);

		// Add *new* transactions to the store
		if (Array.isArray(finalTransactions)) {
			conversationStore._addTransactions(finalTransactions);
		} else if (Array.isArray((finalTransactions as any)?.transactions)) {
			console.warn('[ConvStore] Wrapped transactions object detected — unwrapping.');
			finalTransactions = (finalTransactions as any).transactions; // ✅ FIX HERE
			conversationStore._addTransactions(finalTransactions);
		} else {
			console.error('[ConvStore] Invalid transaction data:', finalTransactions);
			conversationStore._updateStatus('Error adding transactions');
			throw new Error('Invalid transaction structure.');
		}

		conversationStore._setLastExtractionResult(finalTransactions, message, explicitDirectionIntent); // Uses method from main store instance

		const response = `Added ${finalTransactions.length} more transaction(s). Does everything look correct now?`;
		conversationStore._updateStatus('Extraction complete', 100);
		// Return the count of extracted transactions
		return { handled: true, response: response, extractedCount: finalTransactions.length };
	} catch (error) {
		console.error('[ExtractionHandler] Error during extraction:', error);
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		conversationStore._updateStatus('Error during extraction');
		return { handled: true, response: errorMsg }; // Handled the attempt, but failed
	}
}
