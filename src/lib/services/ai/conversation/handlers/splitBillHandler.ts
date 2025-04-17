// src/lib/services/ai/conversation/handlers/splitBillHandler.ts
import { createStateAwareHandler, createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { conversationStore } from '$lib/stores/conversationStore';
import { categorizeTransaction } from '$lib/services/categorizer';
import { formatCurrency, applyExplicitDirection } from '$lib/utils/helpers';
import type { Transaction } from '$lib/types/types';
import type { HandlerContext } from './types';

/**
 * Handler for processing the user's response to a split bill question.
 * Only runs when the system is waiting for the user's share amount.
 */
export const splitBillShareHandler = createStateAwareHandler(
	// State check function - Only run if we're waiting for a split bill share
	(context) => {
		const internalState = get(conversationStore)._internal;
		return !!(internalState.waitingForSplitBillShare && internalState.splitBillContext);
	},
	// Actual handler logic
	async (context) => {
		const { message, explicitDirectionIntent } = context;
		const internalState = get(conversationStore)._internal;

		// Parse share amount from message
		const shareMatch = message.match(/([\d]+(?:[.,]\d+)?)/);
		const shareAmountStr = shareMatch ? shareMatch[1].replace(',', '.') : null;
		const shareAmount = shareAmountStr ? parseFloat(shareAmountStr) : NaN;

		// Validate the amount
		if (!isNaN(shareAmount) && shareAmount > 0) {
			const splitContext = internalState.splitBillContext!;

			// Create the transaction object
			const newTransaction: Transaction = {
				id: uuidv4(),
				batchId: `split-${uuidv4().slice(0, 8)}`,
				date: splitContext.possibleDate,
				description: `Share of ${splitContext.description || 'Shared Item'}`,
				type: 'Split',
				amount: shareAmount,
				currency: splitContext.currency,
				category: categorizeTransaction(
					`Share of ${splitContext.description || 'Shared Item'}`,
					'Split'
				),
				notes: `User share of split bill. Original total: ${splitContext.totalAmount} ${splitContext.currency}`,
				direction: 'out' // Default to expense
			};

			// Apply any explicit direction override
			const finalTransaction = applyExplicitDirection([newTransaction], explicitDirectionIntent)[0];

			// Clear the waiting state
			conversationStore.clearSplitBillWaitState();

			// Format amount for display
			const formattedAmount = formatCurrency(finalTransaction.amount, finalTransaction.currency);

			// Return transaction to be added by middleware
			return {
				response: `Okay, I've added your ${formattedAmount} share for "${finalTransaction.description}".`,
				transactions: [finalTransaction]
			};
		}

		// Handle cancellation
		if (message.toLowerCase().includes('cancel')) {
			conversationStore.clearSplitBillWaitState();
			return { response: "Okay, I've cancelled the split bill entry." };
		}

		// Handle invalid input
		return {
			response:
				"Sorry, I need just the numeric amount for your share (e.g., '10', '15.50'). How much did you personally pay, or say 'cancel'?"
		};
	}
);

/**
 * Handler for detecting split bill scenarios in user input.
 * Looks for patterns like "split $50 for dinner" and prepares for follow-up.
 */
export const splitBillDetectionHandler = createConditionalHandler(
	{
		// Regex to detect split mentions with amounts
		regex: [
			/\bsplit(?:ting)?\b(?:.*?)(?:[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b)?\s?((?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?))\s?([kK])?/i
		]
	},
	async (context) => {
		const { message } = context;

		// Import needed dependencies
		const { getSplitItemDescriptionPrompt } = await import('$lib/services/ai/prompts');
		const { llmChat } = await import('$lib/services/ai/llm-helpers');
		const { resolveAndFormatDate } = await import('$lib/utils/date');

		// Extract amount from the message
		const splitMatch = message.match(
			/\bsplit(?:ting)?\b(?:.*?)(?:[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b)?\s?((?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?))\s?([kK])?/i
		);

		if (!splitMatch) {
			return { response: "I noticed you mentioned splitting, but I couldn't find an amount." };
		}

		// Parse amount
		let amountStr = splitMatch[1].replace(/,/g, '');
		const kSuffix = splitMatch[2];
		if (kSuffix) {
			const num = parseFloat(amountStr);
			amountStr = isNaN(num) ? amountStr : (num * 1000).toString();
		}
		const total = parseFloat(amountStr);

		if (isNaN(total) || total <= 0) {
			return { response: "I couldn't understand the split amount. Could you clarify?" };
		}

		// Use LLM to infer the description
		let contextDescription = 'Shared Item'; // Default
		try {
			console.log('[SplitBillHandler] Getting description from LLM...');
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
				console.log(`[SplitBillHandler] LLM suggested: "${contextDescription}"`);
			}
		} catch (err) {
			console.error('[SplitBillHandler] Error getting description:', err);
		}

		// Extract currency
		const currencyMatch = splitMatch[0].match(
			/[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b/i
		);
		const detectedCurrency = currencyMatch ? currencyMatch[0].toUpperCase() : 'USD';

		// Try to resolve date from message
		const contextDate = resolveAndFormatDate(message);

		// Set state for follow-up
		conversationStore.setWaitingForSplitBillShare({
			totalAmount: total,
			currency: detectedCurrency,
			originalMessage: message,
			possibleDate: contextDate,
			description: contextDescription
		});

		// Return response asking for share
		return {
			response: `You mentioned splitting "${contextDescription}" (total approx. ${total} ${detectedCurrency}). How much was *your* specific share (just the number)?`
		};
	}
);

// Legacy exports for backward compatibility during migration
export async function handleSplitBillShareResponse(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return splitBillShareHandler({
		message,
		explicitDirectionIntent
	});
}
