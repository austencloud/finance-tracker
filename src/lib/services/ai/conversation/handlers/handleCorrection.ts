// src/lib/services/ai/conversation/handlers/handleCorrection.ts

import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid'; // Keep for potential future ID generation if needed

// --- Import specific stores ---
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { categories as categoryStore } from '$lib/stores/categoryStore'; // Import categories store

// --- Import Types ---
import type { Transaction, Category } from '$lib/types/types'; // Adjust path if needed

// --- Import Helpers / Services ---
import { getSystemPrompt, getCorrectionParsingPrompt } from '../../prompts'; // Adjust path
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers'; // Adjust path
import { resolveAndFormatDate } from '$lib/utils/date';

/**
 * Handles user messages attempting to correct a previously extracted transaction.
 * Identifies the target transaction based on context (last corrected or single in batch).
 * Calls LLM to parse the correction, then updates the transaction via transactionStore.
 *
 * @param message The user's input message containing the correction.
 * @param explicitDirectionIntent Optional direction hint (usually null for corrections).
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	// Keywords to identify potential correction attempts
	const correctionKw = /\b(actually|meant|instead|rather|sorry|correct|update|change|fix|no it was|no the)\b/i;
    // Also check if message contains a number, as corrections often involve values
    const containsNumber = /\d/.test(message);

	// Bail out early if it doesn't look like a correction attempt
	// Require a keyword or a number to reduce false positives
	if (!correctionKw.test(message) && !containsNumber) {
		return { handled: false };
	}

	// --- Read internal conversation state ---
	// Access state directly from the imported store using get()
	const internal = get(conversationStore)._internal;
	const batchId = internal.lastExtractionBatchId; // ID of the last batch extracted
	let txnId = internal.lastCorrectionTxnId; // Specific ID user might be correcting

	// --- Identify Target Transaction ---
	// If no specific transaction is in correction context,
	// check if the last extraction batch contained exactly one transaction.
	if (!txnId && batchId) {
		// Read transactions directly from transactionStore state
		const txnsInBatch = get(transactionStore).filter((t: Transaction) => t.batchId === batchId);
		if (txnsInBatch.length === 1) {
			txnId = txnsInBatch[0].id;
            console.log(`[CorrectionHandler] Auto-selected transaction ${txnId} from batch ${batchId} for correction.`);
		}
	}

	// If we still don't have a specific transaction ID, we cannot proceed reliably.
	if (!txnId) {
        console.log('[CorrectionHandler] No specific transaction context found for correction attempt.');
		// Let other handlers try, maybe it's a new transaction mentioning a keyword
        return { handled: false };
	}

	// --- Set Processing Status ---
	// Call action directly on the conversationStore
	conversationStore.setStatus('Applying your correction…', 30);

	try {
		const today = new Date().toISOString().slice(0, 10);
		const sysPrompt = getSystemPrompt(today);

		// --- Find the transaction object from transactionStore state ---
		const transactionToCorrect = get(transactionStore).find((t: Transaction) => t.id === txnId);

		// Handle case where the transaction might have been deleted
		if (!transactionToCorrect) {
			console.error(`[CorrectionHandler] Transaction with ID ${txnId} not found in store.`);
			conversationStore.setStatus('Error: Original transaction not found');
			conversationStore.clearCorrectionContext(); // Clear potentially stale context
			return { handled: true, response: "Sorry, I couldn't find the transaction you wanted to correct anymore." };
		}

        // --- Get current categories for the prompt ---
        const availableCategories = get(categoryStore);

		// --- Prepare Prompt for LLM Correction Parsing ---
		const correctionPrompt = getCorrectionParsingPrompt(
            message,
            transactionToCorrect,
            availableCategories // Pass available categories for validation by LLM
        );

		// --- Call LLM ---
		const aiResp = await llmChat(
			[
				{ role: 'system', content: sysPrompt },
				{ role: 'user', content: correctionPrompt }
			],
			{ temperature: 0.1, rawUserText: message, requestJsonFormat: true } // Low temp, request JSON
		);

		// --- Parse LLM Response ---
		const cleaned = aiResp.trim().replace(/^```json\s*|```$/g, '');
		let parsedCorrection: { id?: string; field_updates?: Record<string, any>, correction_possible?: boolean };
		try {
             parsedCorrection = JSON.parse(cleaned);
        } catch (parseError) {
             console.error('[CorrectionHandler] Failed to parse LLM correction JSON:', parseError, '\nRaw response:', aiResp);
             throw new Error('AI response for correction was not valid JSON.');
        }

        // Check if LLM indicated a correction is possible and provided updates
		if (!parsedCorrection.correction_possible || !parsedCorrection.field_updates || Object.keys(parsedCorrection.field_updates).length === 0) {
            console.log('[CorrectionHandler] LLM indicated no correction possible or no fields found.');
            // If user said "that's correct", we don't want to handle it here.
            conversationStore.setStatus('', 0); // Clear status
            // Don't clear correction context yet, user might try again
			return { handled: false }; // Let other handlers (like handleMood) respond
		}

        const field_updates = parsedCorrection.field_updates;

		// --- Apply Updates ---
		// Override direction if user explicitly stated "in" or "out" (less common for corrections)
		if (explicitDirectionIntent) {
			field_updates.direction = explicitDirectionIntent;
		}

        // Validate/Sanitize updates (Example for amount)
        if (field_updates.hasOwnProperty('amount')) {
            const parsedAmount = parseFloat(field_updates.amount);
            if (isNaN(parsedAmount) || parsedAmount < 0) {
                console.warn(`[CorrectionHandler] Invalid amount in correction: ${field_updates.amount}. Ignoring amount update.`);
                delete field_updates.amount;
            } else {
                field_updates.amount = parsedAmount;
            }
        }
        // TODO: Add validation for date format (YYYY-MM-DD) if LLM provides it
        if (field_updates.hasOwnProperty('date')) {
            const resolvedDate = resolveAndFormatDate(field_updates.date); // Use date resolver
            if (resolvedDate === 'unknown' || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
                 console.warn(`[CorrectionHandler] Invalid date in correction: ${field_updates.date}. Ignoring date update.`);
                 delete field_updates.date;
            } else {
                field_updates.date = resolvedDate;
            }
        }
        // TODO: Add validation for category (must be in availableCategories list)
         if (field_updates.hasOwnProperty('category')) {
            if (!availableCategories.includes(field_updates.category)) {
                 console.warn(`[CorrectionHandler] Invalid category in correction: ${field_updates.category}. Ignoring category update.`);
                 delete field_updates.category;
            }
         }

        // If no valid updates remain after validation
        if (Object.keys(field_updates).length === 0) {
             console.log('[CorrectionHandler] No valid field updates identified after validation.');
             conversationStore.setStatus('', 0);
             return { handled: true, response: "Sorry, I couldn't apply that correction. Could you try phrasing it differently?" };
        }


		// Create the updated transaction object by merging original and updates
		const updatedTxn: Transaction = { ...transactionToCorrect, ...field_updates };

		// --- Update transaction using transactionStore action ---
		transactionStore.update(updatedTxn); // Call action on the specific store
		// --- Update status using conversationStore action ---
		conversationStore.setStatus('Transaction updated', 100);

		// Keep this transaction ID in context for potential follow-up corrections
		// --- Update internal state using conversationStore action ---
		conversationStore._setInternalState({
			lastCorrectionTxnId: transactionToCorrect.id // Keep context on the *corrected* transaction ID
		});

		// Format the confirmation message
		const updates = Object.entries(field_updates)
			.map(([k, v]) => `${k}: ${v}`)
			.join(', ');

		return {
			handled: true,
			response: `✅ Updated "${transactionToCorrect.description}" (${updates}). Anything else?`
		};

	} catch (err) {
		console.error('[CorrectionHandler] Error:', err);
		// --- Update status using conversationStore action ---
		conversationStore.setStatus('Error applying correction');
		// Clear context to avoid loops on error
		// --- Update internal state using conversationStore action ---
		conversationStore.clearCorrectionContext(); // Use specific action

		return {
			handled: true, // Still handled (by error)
			response: getLLMFallbackResponse(err instanceof Error ? err : undefined)
		};
	}
}
