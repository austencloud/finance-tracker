// src/lib/services/ai/conversation/handlers/extractionHandler.ts
import { createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { 
  textLooksLikeTransaction,
  applyExplicitDirection,
  formatCurrency
} from '$lib/utils/helpers';
import { getExtractionPrompt, getSystemPrompt, getSplitItemDescriptionPrompt } from '../../prompts';
import { parseTransactionsFromLLMResponse } from '../../extraction/llm-parser';
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import type { Transaction } from '$lib/types/types';
import type { HandlerContext } from './types';

// Helper functions
// Normalizes description for consistent key generation
function normalizeDescription(desc: string | undefined | null): string {
  if (!desc) return 'unknown';
  return desc.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Creates a unique key for a transaction to help with deduplication
function createTransactionKey(txn: Transaction): string {
  const amountStr = typeof txn.amount === 'number' ? txn.amount.toFixed(2) : '0.00';
  // Include currency in the key for multi-currency uniqueness
  return `${txn.date || 'unknown'}-${amountStr}-${txn.currency?.toUpperCase() || 'USD'}-${
    normalizeDescription(txn.description)
  }-${txn.direction || 'unknown'}`;
}

/**
 * Handler for extracting transactions from user messages.
 * Looks for text that appears to contain transaction information, handles
 * special cases like split bills, then extracts transactions using LLM.
 */
export const extractionHandler = createConditionalHandler(
  {
    // Custom check to see if message looks like it contains transactions
    customCheck: (message) => {
      // Don't handle if we've already processed this exact message
      const internalState = get(conversationStore)._internal;
      const lastProcessedMessage = internalState.lastUserMessageText;
      
      if (lastProcessedMessage && lastProcessedMessage === message) {
        console.warn('[ExtractionHandler] Input message identical to last.');
        conversationStore.addMessage(
          'assistant',
          "It looks like I've already processed that exact text."
        );
        return false;
      }
      
      // Use utility function to check if the text contains transaction info
      return textLooksLikeTransaction(message);
    }
  },
  async (context) => {
    const { message, explicitDirectionIntent } = context;
    
    // Check for split bill scenario first (this is done before standard extraction)
    const splitRegex = /\bsplit(?:ting)?\b(?:.*?)(?:[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b)?\s?((?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?))\s?([kK])?/i;
    const splitMatch = message.match(splitRegex);
    const today = new Date().toISOString().split('T')[0];

    if (splitMatch && splitMatch.index !== undefined) {
      // Process split bill detection
      let amountStr = splitMatch[1].replace(/,/g, '');
      const kSuffix = splitMatch[2];
      if (kSuffix) {
        const num = parseFloat(amountStr);
        amountStr = isNaN(num) ? amountStr : (num * 1000).toString();
      }
      const total = parseFloat(amountStr);

      if (!isNaN(total) && total > 0) {
        // Use LLM to get description context
        let contextDescription = 'Shared Item'; // Default
        try {
          console.log('[ExtractionHandler] Split detected, asking LLM for item description...');
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
            console.log(
              `[ExtractionHandler] LLM suggested split description: "${contextDescription}"`
            );
          } else {
            console.warn(
              "[ExtractionHandler] LLM couldn't provide specific split description, using default."
            );
          }
        } catch (err) {
          console.error('[ExtractionHandler] Error getting description from LLM:', err);
          contextDescription = 'Shared Item'; // Fallback
        }

        const currencyMatch = splitMatch[0].match(
          /[\$£€¥]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b/i
        );
        const detectedCurrency = currencyMatch ? currencyMatch[0].toUpperCase() : 'USD';
        const contextDate = resolveAndFormatDate(message); // Resolve date

        // Set state for follow-up
        conversationStore.setWaitingForSplitBillShare({
          totalAmount: total,
          currency: detectedCurrency,
          originalMessage: message,
          possibleDate: contextDate,
          description: contextDescription
        });
        
        // Ask for user's share
        conversationStore.addMessage(
          'assistant',
          `You mentioned splitting "${contextDescription}" (total approx. ${total} ${detectedCurrency}). How much was *your* specific share (just the number)?`
        );
        
        conversationStore.setStatus('Awaiting split-bill share', 100);

        return { handled: true }; // Stop processing here
      } else {
        console.warn(
          '[ExtractionHandler] Split detected, but could not parse total amount from:',
          splitMatch[0]
        );
      }
    }
    // End Split Bill Handling

    // General Transaction Extraction
    console.log('[ExtractionHandler] Handling general transaction data extraction.');
    conversationStore.setStatus('Extracting transactions...', 30);

    const batchId = uuidv4();
    console.log(`[ExtractionHandler] Generated batchId: ${batchId}`);

    try {
      // Prepare prompt and call LLM
      const extractionPrompt = getExtractionPrompt(message, today);
      const messages = [
        { role: 'system' as const, content: getSystemPrompt(today) },
        { role: 'user' as const, content: extractionPrompt }
      ];
      let aiResponse = await llmChat(messages, { temperature: 0.2, rawUserText: message });

      // Parse response (parser uses resolveAndFormatDate)
      let parsedTransactions = parseTransactionsFromLLMResponse(aiResponse, batchId);

      // Log if fewer transactions found than expected (optional)
      const estimateClauses = message
        .split(/\band\b/i)
        .map((s) => s.trim())
        .filter(Boolean).length;
      if (
        Array.isArray(parsedTransactions) &&
        parsedTransactions.length > 0 &&
        parsedTransactions.length < estimateClauses
      ) {
        console.log(
          `[Extraction] Found ${parsedTransactions.length} of ~${estimateClauses} expected transactions.`
        );
      } else if (Array.isArray(parsedTransactions) && parsedTransactions.length === 0) {
        console.warn(`[Extraction] No transactions parsed by LLM from: "${message}"`);
      }

      // Handle parsing failure
      if (!Array.isArray(parsedTransactions)) {
        console.warn('[ExtractionHandler] Failed to parse valid transaction array from AI response.');
        const fallback = getLLMFallbackResponse(new Error('AI response parsing failed'));
        conversationStore.setStatus('Error parsing response');
        conversationStore.clearCorrectionContext();
        return { response: fallback };
      }

      // Check for Asset Clarification Needs
      const transactionsToAdd: Transaction[] = [];
      let needsAssetClarification = false;
      let clarificationMessage = '';

      for (const txn of parsedTransactions) {
        if (txn.needs_clarification) {
          // Check flag from parser/LLM
          needsAssetClarification = true;
          if (!clarificationMessage) clarificationMessage = txn.needs_clarification;
          console.log(
            `[ExtractionHandler] Transaction needs clarification: ${txn.needs_clarification}`
          );
        } else {
          transactionsToAdd.push(txn);
        }
      }

      // Add Clear Transactions & Handle Clarification Request
      let addedCount = 0;
      let response = '';

      if (transactionsToAdd.length > 0) {
        let finalNonAmbiguous = applyExplicitDirection(transactionsToAdd, explicitDirectionIntent);
        
        // Deduplicate before adding
        const currentMainTransactions = get(transactionStore);
        const existingKeys = new Set(currentMainTransactions.map(createTransactionKey));
        const trulyNewNonAmbiguous = finalNonAmbiguous.filter(
          (newTxn) => !existingKeys.has(createTransactionKey(newTxn))
        );

        if (trulyNewNonAmbiguous.length > 0) {
          // Return transactions to be added by middleware
          addedCount = trulyNewNonAmbiguous.length;
          response = `Added ${addedCount} transaction(s). `;
          
          // Return to be processed by middleware
          return {
            response,
            transactions: trulyNewNonAmbiguous
          };
        }
      }

      // If clarification needed, ask and stop
      if (needsAssetClarification && clarificationMessage) {
        conversationStore.addMessage('assistant', clarificationMessage);
        conversationStore.setStatus('Awaiting clarification', 100);
        
        // Store context for follow-up
        conversationStore._setInternalState({
          lastUserMessageText: message,
          lastExtractionBatchId: batchId
        });
        
        return {
          response: addedCount > 0 ? response + 'Waiting for clarification on another item.' : ''
        };
      }

      // Handle cases where nothing new was added
      if (addedCount === 0) {
        if (parsedTransactions.length > 0) {
          // Parsed but all duplicates/clarification needed
          console.warn(
            `[ExtractionHandler] All extracted transaction(s) were duplicates or needed clarification.`
          );
          conversationStore.setStatus('Duplicates detected / Clarification needed', 100);
          conversationStore.clearCorrectionContext();
          response = "It looks like I've already recorded those transactions or need more details.";
        } else {
          // LLM returned empty
          console.log('[ExtractionHandler] LLM returned empty array.');
          conversationStore.setStatus('No new transactions found', 100);
          response = "I looked through that text but couldn't find any clear transactions to add.";
        }
        
        // Store context for follow-up
        conversationStore._setInternalState({
          lastUserMessageText: message,
          lastExtractionBatchId: batchId
        });
        
        return { response };
      }

      // Success: Transactions added, no clarification needed
      conversationStore._setInternalState({
        lastUserMessageText: message,
        lastExtractionBatchId: batchId
      });
      
      response += `You can see them in the list now.`;
      conversationStore.setStatus('Extraction complete', 100);
      
      return { 
        response,
        extractedCount: addedCount
      };
    } catch (error) {
      // General error handling
      console.error('[ExtractionHandler] Error during extraction:', error);
      const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
      conversationStore.setStatus('Error during extraction');
      conversationStore.clearCorrectionContext();
      
      return { response: errorMsg };
    }
  }
);

// Legacy export for backward compatibility during migration
export async function handleExtraction(
  message: string,
  explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string; extractedCount?: number }> {
  const result = await extractionHandler({ 
    message, 
    explicitDirectionIntent 
  });
  
  return { 
    handled: result.handled, 
    response: result.response,
    extractedCount: result.extractedCount
  };
}