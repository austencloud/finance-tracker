// src/lib/services/ai/conversation/handlers/fillDetailsHandler.ts
import { createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { getLLMFallbackResponse } from '../../llm-helpers';
import type { Transaction } from '$lib/types/types';
import type { HandlerContext } from './types';

/**
 * Handler for requests to fill in missing details (like category, date) for specific or all transactions.
 * Currently a placeholder with minimal implementation that can be expanded in the future.
 */
export const fillDetailsHandler = createConditionalHandler(
	{
		// Keywords for detecting fill details intent
		keywords: [
			'categorize',
			'category',
			'fill in',
			'details',
			'date for',
			'missing',
			'what was the'
		]
	},
	async (context: HandlerContext) => {
		const { message } = context;
		const lowerMessage = message.toLowerCase().trim();

		// Get all transactions from the store
		const currentTransactions = get(transactionStore);

		// Check if there are any transactions to work with
		if (!Array.isArray(currentTransactions) || currentTransactions.length === 0) {
			return {
				response: "I don't have any transactions recorded yet to fill in details for."
			};
		}

		console.log('[FillDetailsHandler] Detected request to fill details (Placeholder).');
		conversationStore.setStatus('Analyzing detail request...', 40);

		// Simple placeholder implementation for "Categorize all"
		if (lowerMessage.includes('categorize all') || lowerMessage.includes('categorise all')) {
			// TODO: Implement actual categorization logic
			console.log('[FillDetailsHandler] Auto-categorization requested (Not Implemented).');
			conversationStore.setStatus('Auto-categorization not implemented', 100);

			return {
				response: "Sorry, automatically categorizing all transactions isn't fully implemented yet."
			};
		}

		// Fallback for other unhandled detail-filling requests
		console.log('[FillDetailsHandler] Specific detail filling not implemented.');
		conversationStore.setStatus('Detail filling not implemented', 100);

		return {
			response:
				"Sorry, I can't automatically fill in those specific details just yet. You can click on a transaction to edit it manually."
		};

		/* 
    Potential Future Implementation Structure:
    
    try {
      // 1. Identify target transactions
      const targetTxns = []; // TODO: Implement logic to find target transactions
      
      // 2. Identify fields to fill
      const fields = []; // TODO: Implement logic to determine which fields to fill
      
      if (targetTxns.length > 0 && fields.length > 0) {
        conversationStore.setStatus('Inferring details...', 60);
        
        // 3. Loop through targets and infer/update
        for (const txn of targetTxns) {
          let updates = {};
          // TODO: Add logic for inferring/updating each field type
          
          // 4. Update using transactionStore action
          if (Object.keys(updates).length > 0) {
            transactionStore.update({ ...txn, ...updates });
          }
        }
        
        conversationStore.setStatus('Details updated', 100);
        return { 
          response: "Okay, I've filled in the missing details."
        };
      } else {
        return { 
          response: "I understand you want to fill details, but I'm not sure which transaction or what specific detail you mean."
        };
      }
    } catch (error) {
      console.error('[FillDetailsHandler] Error:', error);
      conversationStore.setStatus('Error filling details');
      const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
      return { response: errorMsg };
    }
    */
	}
);

// Legacy export for backward compatibility during migration
export async function handleFillDetails(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return fillDetailsHandler({
		message,
		explicitDirectionIntent
	});
}
