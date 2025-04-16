// src/lib/services/ai/conversation/handlers/handleCorrection.ts

import { get } from 'svelte/store';
import { appStore } from '$lib/stores/AppStore';
import type { Transaction, Category, AppState } from '$lib/stores/types'; // Import AppState for type hint
import { resolveAndFormatDate } from '$lib/utils/date';
import { deepseekGenerateJson, getFallbackResponse } from '../../deepseek-client'; // Use JSON generation
import { getCorrectionParsingPrompt } from '../../prompts'; // Import the new prompt
import { parseJsonFromAiResponse } from '$lib/utils/helpers'; // Keep JSON parser

// --- Remove old regex helper functions ---
// function parseAmountFromText(text: string): number | null { /* ... */ }
// function parseDescriptionFromText(text: string): string | null { /* ... */ }
// function parseCategoryFromText(text: string, availableCategories: readonly Category[]): Category | null { /* ... */ }
// --- End Removal ---

// Define expected structure from LLM response
interface CorrectionParseResult {
	correction_possible?: boolean;
	target_field?: 'amount' | 'date' | 'description' | 'category' | 'unknown'; // Extend later
	new_value?: string | number | null;
}

export async function handleCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null // Keep signature consistent
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();

	// --- 1. Check Context ---
	// We only attempt correction if there's a specific batch ID context
	const conversationInternalState = get(appStore).conversation._internal;
	const lastBatchId = conversationInternalState.lastExtractionBatchId;

	if (!lastBatchId) {
		// No context batch ID, this handler doesn't apply
		return { handled: false };
	}

	// --- Avoid interfering with other clarification flows ---
	if (
		conversationInternalState.waitingForDirectionClarification ||
		conversationInternalState.waitingForCorrectionClarification || // Don't run if already asking for clarification
		conversationInternalState.waitingForDuplicateConfirmation
	) {
		return { handled: false };
	}

	// --- Avoid triggering on simple affirmations/negations if not correcting ---
	const simpleAffirmations = [
		'ok',
		'okay',
		'yes',
		'yep',
		'sounds good',
		'got it',
		'cool',
		'right',
		'correct'
	];
	const simpleNegations = ['no', 'nope', 'cancel'];
	if (simpleAffirmations.includes(lowerMessage) || simpleNegations.includes(lowerMessage)) {
		// If user just says yes/no/ok, it's probably not a correction *unless*
		// we implement the explicit confirmation step later. For now, assume it's not.
		return { handled: false };
	}

	console.log(`[CorrectionHandler] Checking message for correction for batch ${lastBatchId}.`);
	// Don't set status yet, LLM might say it's not a correction

	// --- 2. Retrieve Target Transaction(s) ---
	const allTransactions = get(appStore).transactions;
	const availableCategories = get(appStore).categories;
	const targetBatchTransactions = allTransactions.filter((t) => t.batchId === lastBatchId);

	// --- 3. Handle Transaction Retrieval Issues ---
	if (targetBatchTransactions.length === 0) {
		console.warn(
			`[CorrectionHandler] Context batch ID ${lastBatchId} found, but no matching transactions in store.`
		);
		// Clear invalid context and inform user
		appStore.clearCorrectionContext();
		// Don't set status here, let finishProcessing handle response
		return {
			handled: true,
			response: "Sorry, I can't find the transaction(s) you might be referring to anymore."
		};
	}

	// --- Handle Ambiguity (Using State - Requires handleCorrectionClarification handler later) ---
	if (targetBatchTransactions.length > 1) {
		console.log(
			`[CorrectionHandler] Ambiguity detected: ${targetBatchTransactions.length} transactions in batch ${lastBatchId}. Attempting to parse correction first.`
		);
		// We'll still try to parse the correction. If successful, we'll ask for clarification.
		// If parsing fails, we'll return the parsing error instead of asking which one.
	}

	// --- 4. Call LLM to Parse Correction Intent & Details ---
	// For now, assume we are correcting the FIRST transaction if multiple exist.
	// Handling ambiguity properly requires the clarification flow (Phase 5).
	// Let's proceed assuming targetTxn is the one to correct for now.
	// If length > 1, we'll ask later *if* parsing succeeds.
	const targetTxnForPrompt = targetBatchTransactions[0]; // Use first as context for LLM prompt

	appStore.setConversationStatus('Understanding correction...', 30); // Update status

	let parsedCorrection: CorrectionParseResult | null = null;
	let llmError = null;

	try {
		const prompt = getCorrectionParsingPrompt(message, targetTxnForPrompt, availableCategories);
		const jsonResponse = await deepseekGenerateJson(prompt); // Use JSON mode client
		parsedCorrection = parseJsonFromAiResponse<CorrectionParseResult>(jsonResponse);
	} catch (error) {
		console.error('[CorrectionHandler] LLM call failed:', error);
		llmError = getFallbackResponse(error instanceof Error ? error : undefined);
		// Proceed to error handling below
	}

	// --- 5. Process LLM Response ---

	// Handle LLM Error or Parsing Failure
	if (llmError || !parsedCorrection) {
		appStore.setConversationStatus('Error understanding correction', 100);
		// Keep context, user might rephrase
		return {
			handled: true,
			response: llmError || 'Sorry, I had trouble understanding your correction request.'
		};
	}

	// Check if LLM determined it wasn't a correction attempt
	if (!parsedCorrection.correction_possible) {
		console.log('[CorrectionHandler] LLM determined message was not a correction.');
		// This wasn't a correction, let other handlers try (like handleNormalResponse)
		appStore.setConversationStatus(''); // Clear status
		return { handled: false };
	}

	// Extract parsed details
	const fieldToUpdate = parsedCorrection.target_field ?? 'unknown';
	const newValue = parsedCorrection.new_value; // Can be string, number, or null

	// --- 6. Validate Parsed Field and Value ---
	let validationError: string | null = null;
	let finalValue: string | number | Category | null = null; // Use specific types

	if (fieldToUpdate === 'unknown' || newValue === null) {
		validationError =
			"I understood you wanted to make a correction, but I couldn't figure out the specific field or the new value. Could you please rephrase?";
	} else if (fieldToUpdate === 'amount') {
		if (typeof newValue === 'number' && newValue >= 0) {
			finalValue = newValue;
		} else {
			validationError =
				"The amount provided doesn't seem to be a valid number. Please provide a positive number (e.g., 'amount is 10.50').";
		}
	} else if (fieldToUpdate === 'date') {
		if (typeof newValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(newValue)) {
			// Further check if the date is reasonable (e.g., not too far in future/past) - optional
			finalValue = newValue;
		} else {
			// Try resolving again just in case LLM returned relative term
			const resolved = resolveAndFormatDate(String(newValue));
			if (resolved !== 'unknown' && /^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
				finalValue = resolved;
			} else {
				validationError = `The date provided ('${newValue}') doesn't seem to be in a recognized format (YYYY-MM-DD).`;
			}
		}
	} else if (fieldToUpdate === 'description') {
		if (typeof newValue === 'string' && newValue.trim().length > 0) {
			finalValue = newValue.trim();
		} else {
			validationError =
				'The description provided seems empty. Please provide the new description text.';
		}
	} else if (fieldToUpdate === 'category') {
		if (typeof newValue === 'string' && availableCategories.includes(newValue as Category)) {
			finalValue = newValue as Category; // Already validated by prompt/LLM hopefully
		} else {
			validationError = `The category '${newValue}' is not valid. Please choose from: ${availableCategories.join(', ')}.`;
		}
	} else {
		// Should not happen if target_field is correctly typed
		validationError = "Sorry, I can't correct that type of field yet.";
	}

	// Handle Validation Failure
	if (validationError) {
		console.warn(`[CorrectionHandler] Validation failed: ${validationError}`);
		appStore.setConversationStatus('Correction invalid', 100);
		// Keep context
		return { handled: true, response: validationError };
	}

	// --- 7. Handle Ambiguity (If multiple transactions matched context) ---
	if (targetBatchTransactions.length > 1) {
		console.log(
			`[CorrectionHandler] Correction parsed successfully, but ambiguity remains (${targetBatchTransactions.length} txns). Asking for clarification.`
		);

		const potentialIds = targetBatchTransactions.map((t) => t.id);
		const potentialDescriptions = targetBatchTransactions.map(
			(t) => `${t.description} (${t.date}, $${t.amount.toFixed(2)})`
		);

		const pendingDetails = {
			originalMessage: message,
			parsedField: fieldToUpdate, // Now guaranteed to be valid field name
			parsedValue: finalValue, // Use the validated final value
			potentialTxnIds: potentialIds,
			potentialTxnDescriptions: potentialDescriptions
		};

		// Set the clarification state in AppStore
		appStore.setCorrectionClarificationNeeded(
			pendingDetails as Exclude<
				AppState['conversation']['_internal']['pendingCorrectionDetails'],
				null
			>
		);

		// Create user prompt
		let clarificationPrompt = `Okay, I understand you want to change the ${fieldToUpdate} to '${finalValue}'. I found ${targetBatchTransactions.length} transactions from your last input. Which one did you mean?\n`;
		potentialDescriptions.forEach((desc, index) => {
			clarificationPrompt += `\n${index + 1}. ${desc}`;
		});
		clarificationPrompt += `\n\nPlease reply with the number or description.`;

		appStore.setConversationStatus('Waiting for clarification', 50);
		return { handled: true, response: clarificationPrompt };
	}

	// --- 8. Apply Correction (Exactly one transaction) ---
	const targetTxn = { ...targetBatchTransactions[0] }; // Get the single transaction
	console.log(
		`[CorrectionHandler] Applying parsed correction to single transaction ${targetTxn.id}`
	);

	// Update the specific field
	if (fieldToUpdate === 'amount') {
		targetTxn.amount = finalValue as number;
	} else if (fieldToUpdate === 'date') {
		targetTxn.date = finalValue as string;
	} else if (fieldToUpdate === 'description') {
		targetTxn.description = finalValue as string;
	} else if (fieldToUpdate === 'category') {
		targetTxn.category = finalValue as Category;
	}

	// --- 9. Update State & Respond ---
	try {
		appStore.updateTransaction(targetTxn);
		console.log(`[CorrectionHandler] Successfully updated transaction ${targetTxn.id}`);

		let friendlyFieldName: string;
		// Format response based on field type
		if (fieldToUpdate === 'amount') {
			friendlyFieldName = `amount to $${(finalValue as number).toFixed(2)}`;
		} else if (fieldToUpdate === 'date') {
			friendlyFieldName = `date to ${finalValue}`;
		} else if (fieldToUpdate === 'description') {
			friendlyFieldName = `description to "${finalValue}"`;
		} else if (fieldToUpdate === 'category') {
			friendlyFieldName = `category to "${finalValue}"`;
		} else {
			friendlyFieldName = 'details';
		} // Fallback

		const response = `Okay, I've updated the ${friendlyFieldName} for the transaction originally described as "${targetBatchTransactions[0].description}".`;

		appStore.clearCorrectionContext(); // Clear general context
		appStore.setConversationStatus('Correction applied', 100);
		return { handled: true, response: response };
	} catch (updateError) {
		console.error(`[CorrectionHandler] Error updating transaction in store:`, updateError);
		appStore.setConversationStatus('Error updating', 100);
		// Don't clear context if update failed
		return {
			handled: true,
			response: 'Sorry, I understood the correction but encountered an error trying to save it.'
		};
	}
}
