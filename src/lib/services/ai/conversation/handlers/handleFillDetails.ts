// src/lib/services/ai/conversation/handlers/fill-details-handler.ts
import { get } from 'svelte/store';

import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getExtractionPrompt, getSystemPrompt } from '../../prompts'; // May need specific prompts
// NOTE: Ensure parseJsonFromAiResponse is defined and exported from helpers
import {
	applyExplicitDirection,
	parseJsonFromAiResponse,
	textLooksLikeTransaction
} from '$lib/utils/helpers';
import { extractedTransactions } from '../conversationDerivedStores';
import { conversationStore } from '../conversationStore';

/**
 * Handles requests to fill in missing details (like category, date) for specific or all transactions.
 * Example: "Categorize these", "What was the date for the Amazon purchase?", "Fill in missing dates".
 * (Placeholder - Requires more complex logic for identifying target transactions)
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleFillDetails(
	message: string
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();
	const keywords = ['categorize', 'category', 'fill in', 'details', 'date for', 'missing'];

	if (!keywords.some((k) => lowerMessage.includes(k))) {
		return { handled: false };
	}

	const currentTransactions = get(extractedTransactions);
	// Check if the result is an array and has elements
	if (!Array.isArray(currentTransactions) || currentTransactions.length === 0) {
		return {
			handled: true,
			response: "I don't have any transactions recorded yet to fill in details for."
		};
	}

	console.log('[FillDetailsHandler] Detected request to fill details (Placeholder).');
	conversationStore._updateStatus('Attempting to fill details...', 40);

	// --- Placeholder Logic ---
	// This is complex. It needs to:
	// 1. Understand *which* transactions the user is referring to (e.g., "the Amazon one", "the last 3", "all of them").
	// 2. Understand *what* details need filling (category, date, description refinement?).
	// 3. Potentially call the AI to infer missing details based on context.
	// 4. Update the specific transactions in the store.

	// Example: Simple case - "Categorize all"
	if (lowerMessage.includes('categorize all') || lowerMessage.includes('categorise all')) {
		// TODO: Implement actual categorization logic (likely involves AI call per transaction or batch)
		conversationStore._updateStatus('Categorization not implemented', 100);
		return {
			handled: true,
			response: "Sorry, automatically categorizing all transactions isn't fully implemented yet."
		};
	}

	// Fallback for other requests until implemented
	conversationStore._updateStatus('Detail filling not implemented', 100);
	return {
		handled: true,
		response:
			"Sorry, I can't automatically fill in those details just yet. You can manually edit the transactions."
	};

	// --- Potential Future Implementation ---
	/*
    try {
        // 1. Identify target transactions (e.g., find transactions matching "Amazon")
        // 2. Prepare prompt for AI (e.g., "Suggest a category for 'Amazon purchase $50'")
        // 3. Call AI (deepseekChat)
        // 4. Parse response using parseJsonFromAiResponse or similar
        // 5. Update transaction(s) in the store using a specific update method
        // 6. Formulate response

        conversationStore._updateStatus('Details updated', 100);
        return { handled: true, response: "Okay, I've attempted to fill in the details." };

    } catch (error) {
        console.error('[FillDetailsHandler] Error:', error);
        conversationStore._updateStatus('Error filling details');
        // Use getFallbackResponse(error) here
        return { handled: true, response: "Sorry, I encountered an error trying to fill in the details." };
    }
    */
}
