// src/lib/services/ai/conversation/handlers/splitBillHandler.ts
import { createStateAwareHandler, createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { conversationStore } from '$lib/stores/conversationStore';
import { categorizeTransaction } from '$lib/services/categorizer';
import { formatCurrency, applyExplicitDirection } from '$lib/utils/helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import { llmGenerateJson } from '../../llm-helpers';
import type { Transaction } from '$lib/types/types';
import type { HandlerContext } from './types';
import { getSplitBillExtractionPrompt } from '../../prompts/extractionPrompts';

/**
 * Enhanced handler using LLM for split bill detection and extraction.
 * First attempts to extract all information at once using LLM,
 * falls back to regex patterns if needed.
 */
export const enhancedSplitBillHandler = createConditionalHandler(
	{
		// Keywords that suggest a split bill scenario
		regex: [
			/\b(?:split|share|divid|portion|part|my half|my share|chip in|pitch in|each|divided|amongst|between)\b/i
		]
	},
	async (context) => {
		const { message, explicitDirectionIntent } = context;

		// Skip short messages unlikely to be about splits
		if (message.length < 10) return { handled: false };

		try {
			// Get today's date for context
			const today = new Date().toISOString().split('T')[0];

			// Attempt LLM extraction
			const prompt = getSplitBillExtractionPrompt(message, today);
			const jsonResponse = await llmGenerateJson([{ role: 'user', content: prompt }], {
				temperature: 0.1
			});

			// Parse the response
			const splitData = JSON.parse(jsonResponse);

			// If not a split bill, let other handlers process it
			if (!splitData.is_split_bill) {
				return { handled: false };
			}

			// Resolve the date
			const date = splitData.date || resolveAndFormatDate(message);

			// If we need to ask for the share amount
			if (splitData.needs_share_clarification || splitData.share_amount === null) {
				// Set state for follow-up
				conversationStore.setWaitingForSplitBillShare({
					totalAmount: splitData.total_amount,
					currency: splitData.currency,
					originalMessage: message,
					possibleDate: date,
					description: splitData.description
				});

				// Return response asking for share
				return {
					response: `You mentioned splitting "${splitData.description}" (total approx. ${splitData.total_amount} ${splitData.currency}). How much was *your* specific share (just the number)?`
				};
			}

			// If we have all the info, create the transaction directly
			const newTransaction: Transaction = {
				id: uuidv4(),
				batchId: `split-${uuidv4().slice(0, 8)}`,
				date,
				description: `Share of ${splitData.description}`,
				type: 'Split',
				amount: splitData.share_amount,
				currency: splitData.currency,
				categories: [categorizeTransaction(`Share of ${splitData.description}`, 'Split')],
				notes: `User share of split bill. Original total: ${formatCurrency(splitData.total_amount, splitData.currency)}. Original message: "${message}"`,
				direction: 'out' // Default to expense
			};

			// Apply any explicit direction override
			const finalTransaction = applyExplicitDirection([newTransaction], explicitDirectionIntent)[0];

			// Return transaction to be added by middleware
			return {
				response: `I've added your ${formatCurrency(finalTransaction.amount, finalTransaction.currency)} share of the "${splitData.description}" (total: ${formatCurrency(splitData.total_amount, splitData.currency)}).`,
				transactions: [finalTransaction],
				handled: true
			};
		} catch (error) {
			// Log error and fall back to the original regex handler
			console.error('[EnhancedSplitBillHandler] Error:', error);
			return splitBillDetectionHandler(context);
		}
	}
);

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
		const splitContext = internalState.splitBillContext!;

		// Enhanced detection of new transaction request patterns
		const newTransactionPatterns = [
			// Split bill patterns
			/\b(?:split|share|divid|split(?:ting)?)\b(?:.*?)(?:[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b)?\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/i,
			// Generic money mention patterns that likely indicate a new transaction
			/(?:[\$£€¥]\s*\d|\d\s*(?:dollars|euro|pound|yen))/i,
			// Direct mention of a new transaction
			/\b(?:new|another|different)\b.*?\b(?:transaction|payment|bill|expense|cost)\b/i
		];

		const isNewTransactionRequest = newTransactionPatterns.some((pattern) => pattern.test(message));

		// If this appears to be a new transaction request rather than a response to the previous one
		if (isNewTransactionRequest) {
			console.log('[SplitBillShareHandler] Detected new transaction request, resetting state');

			// Clear the waiting state so other handlers can process this as a new request
			conversationStore.clearSplitBillWaitState();

			// Get a description of the previous transaction context for user clarity
			const prevDesc = splitContext.description || 'split bill';
			const prevAmount = formatCurrency(splitContext.totalAmount, splitContext.currency);

			// Return a response acknowledging the change with a natural transition
			return {
				response: `I see you're mentioning a new transaction. I'll cancel the previous ${prevDesc} (${prevAmount}) and process this new one instead.`,
				handled: false, // Allow chain to continue to other handlers
				chainResponse: true // Tell middleware to append next handler's response
			};
		}

		// Parse share amount from message (only if not a new transaction request)
		const shareMatch = message.match(/([\d]+(?:[.,]\d+)?)/);
		const shareAmountStr = shareMatch ? shareMatch[1].replace(',', '.') : null;
		const shareAmount = shareAmountStr ? parseFloat(shareAmountStr) : NaN;

		// Validate the amount
		if (!isNaN(shareAmount) && shareAmount > 0) {
			const splitContext = internalState.splitBillContext!;

			// Validate that share amount doesn't exceed total amount
			if (shareAmount > splitContext.totalAmount) {
				return {
					response: `Your share (${formatCurrency(shareAmount, splitContext.currency)}) cannot be greater than the total amount (${formatCurrency(splitContext.totalAmount, splitContext.currency)}). Please enter your actual share.`
				};
			}

			// Create the transaction object
			const newTransaction: Transaction = {
				id: uuidv4(),
				batchId: `split-${uuidv4().slice(0, 8)}`,
				date: splitContext.possibleDate,
				description: `Share of ${splitContext.description || 'Shared Item'}`,
				type: 'Split',
				amount: shareAmount,
				currency: splitContext.currency,
				categories: [
					categorizeTransaction(`Share of ${splitContext.description || 'Shared Item'}`, 'Split')
				],
				notes: `User share of split bill. Original total: ${formatCurrency(splitContext.totalAmount, splitContext.currency)}. Original message: "${splitContext.originalMessage}"`,
				direction: 'out'
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

// Legacy regex-based split bill detection handler, now used as fallback
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
		const { getSplitItemDescriptionPrompt } = await import(
			'$lib/services/ai/prompts/extractionPrompts'
		);
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
