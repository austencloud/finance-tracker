// src/lib/services/ai/conversation/conversationService.ts
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { transactionStore } from '$lib/stores/transactionStore';
import { getHandlerChain } from './handlers/setup';
import { getSystemPrompt, getSummaryPrompt } from '../prompts';
import { llmChat, getLLMFallbackResponse } from '../llm-helpers';
import { formatCurrency as formatCurrencyUtil } from '$lib/utils/helpers';
import { OllamaApiError } from '../ollama-client';

// --- Regex helpers for direction intent detection ---
const BULK_DIRECTION_ALL_IN_REGEX = /\b(all|these are all|mark all as)\s+(in|income|deposits?)\b/i;
const BULK_DIRECTION_ALL_OUT_REGEX = /\b(all|these are all|mark all as)\s+(out|expenses?|payments?|spending)\b/i;

// ────────────────────────────────────────────────────────────────────────────
// Processing helpers
// ────────────────────────────────────────────────────────────────────────────
function startProcessing(message: string): void {
  // Add user message to conversation
  conversationStore.addMessage('user', message);
  conversationStore.setProcessing(true);
  conversationStore.setStatus('Thinking…', 10);
}

function finishProcessing(assistantResponse: string | undefined): void {
  const finalResponse = assistantResponse?.trim();
  if (finalResponse && finalResponse.length > 0) {
    // Add assistant response to conversation
    conversationStore.addMessage('assistant', finalResponse);
  }

  // Update status
  conversationStore.setStatus('Finished', 100);

  // Debounce setting processing to false
  setTimeout(() => {
    // Check if status is still 'Finished' before clearing
    if (get(conversationStore).status === 'Finished') {
      conversationStore.setStatus('', 0);
    }
    conversationStore.setProcessing(false);
  }, 300);
}

function handleProcessingError(error: unknown): string {
  console.error('[Processing error]:', error);
  conversationStore.setStatus('Error');

  let message = "I'm having trouble processing that…";

  // Error handling logic
  if (error instanceof OllamaApiError) {
    if (error.status === 408) {
      message = 'Local Ollama timed out. Is the server still running?';
    } else if (error.message.includes('not installed')) {
      message = error.message; // conveys "ollama pull …"
    } else {
      message = `Ollama error (${error.status ?? 'network'}): ${error.message}`;
    }
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = `Unexpected error: ${(error as Error).message}`;
  }

  return message;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Process a user message through the handler system
 */
export async function sendMessage(message: string): Promise<void> {
  message = message.trim();
  if (!message) return;

  // Check if already processing
  if (get(conversationStore).isProcessing) {
    conversationStore.addMessage(
      'assistant',
      "I'm still working on the previous request. Please wait."
    );
    return;
  }

  startProcessing(message);

  // Detect explicit direction intent
  let explicitDirectionIntent: 'in' | 'out' | null = null;
  const lower = message.toLowerCase();
  if (BULK_DIRECTION_ALL_IN_REGEX.test(lower) && lower.length < 50) {
    explicitDirectionIntent = 'in';
  }
  if (BULK_DIRECTION_ALL_OUT_REGEX.test(lower) && lower.length < 50) {
    explicitDirectionIntent = 'out';
  }

  let assistantResponse = '';

  try {
    // Get the handler chain from setup
    const handlerChain = getHandlerChain();
    
    // Process the message with the handler chain
    const result = await handlerChain({ 
      message, 
      explicitDirectionIntent 
    });
    
    // Extract the response from the result
    assistantResponse = result.response ?? '';
    
    // If no handler processed the message and no response was generated
    if (!result.handled && !assistantResponse) {
      console.log('[sendMessage] No handler processed the message.');
      assistantResponse = "I'm not sure how to respond to that. If you have transaction data or questions about your finances, I'm here to help!";
    }
  } catch (err) {
    // Handle any errors that weren't caught by middleware
    assistantResponse = handleProcessingError(err);
  } finally {
    // Always finish processing
    finishProcessing(assistantResponse);
  }
}

/**
 * Generate a summary of the user's financial data
 */
export async function generateSummary(): Promise<void> {
  // Check if already processing
  if (get(conversationStore).isProcessing) {
    conversationStore.addMessage(
      'assistant',
      'Please wait until the current processing is finished.'
    );
    return;
  }

  // Get transactions from store
  const txns = get(transactionStore);
  if (!txns || txns.length === 0) {
    conversationStore.addMessage('assistant', 'No transactions recorded yet to summarise.');
    return;
  }

  // Set processing state
  conversationStore.setProcessing(true);
  conversationStore.setStatus('Generating summary…', 50);

  let summaryResponse = '';
  const today = new Date().toISOString().split('T')[0];

  try {
    // Generate the prompt and call LLM
    const promptContent = getSummaryPrompt(txns);
    const messages = [
      { role: 'system' as const, content: getSystemPrompt(today) },
      { role: 'user' as const, content: promptContent }
    ];
    summaryResponse = await llmChat(messages, { temperature: 0.5, rawUserText: promptContent });

    // Fallback if LLM doesn't provide a good summary
    if (!summaryResponse?.trim()) {
      // Simple fallback calculation (not currency-aware)
      const income = txns
        .filter((t) => t.direction === 'in')
        .reduce((s, t) => s + (t.amount || 0), 0);
      const expense = txns
        .filter((t) => t.direction === 'out')
        .reduce((s, t) => s + (t.amount || 0), 0);
      
      summaryResponse =
        `Summary based on ${txns.length} recorded transactions: ` +
        `Total Income: ${formatCurrencyUtil(income)}, ` +
        `Total Expenses: ${formatCurrencyUtil(expense)}. (Note: totals may mix currencies)`;
    }
  } catch (err) {
    console.error('[generateSummary] LLM error:', err);
    conversationStore.setStatus('Error generating summary');
    summaryResponse = 'There was an error generating the summary.';
  } finally {
    finishProcessing(summaryResponse);
  }
}

/**
 * Reset the conversation and clear state
 */
export function abortAndClear(): void {
  console.log('[abortAndClear] Clearing conversation and resetting state.');
  conversationStore.reset();
  conversationStore.setProcessing(false);
}

/**
 * Initialize the conversation with a welcome message
 */
export function initialize(): void {
  console.log('[initialize] Resetting conversation state.');
  conversationStore.reset();
}

/**
 * Feature flag for using the new handler architecture
 * This can be used during migration to toggle between old and new systems
 */
export const USE_NEW_HANDLER_ARCHITECTURE = true;

/**
 * Alternative implementation of sendMessage using the legacy handler chain
 * This can be used during migration when the feature flag is off
 * 
 * @deprecated Use the new handler architecture instead
 */
export async function sendMessageLegacy(message: string): Promise<void> {
  message = message.trim();
  if (!message) return;

  if (get(conversationStore).isProcessing) {
    conversationStore.addMessage(
      'assistant',
      "I'm still working on the previous request. Please wait."
    );
    return;
  }

  startProcessing(message);

  let explicitDirectionIntent: 'in' | 'out' | null = null;
  const lower = message.toLowerCase();
  if (BULK_DIRECTION_ALL_IN_REGEX.test(lower) && message.length < 50)
    explicitDirectionIntent = 'in';
  if (BULK_DIRECTION_ALL_OUT_REGEX.test(lower) && message.length < 50)
    explicitDirectionIntent = 'out';

  // Import legacy handlers (These imports would need to be added at the top of the file)
  // import { handleMood } from './handlers/moodHandler';
  // import { handleDirectionClarification } from './handlers/directionClarificationHandler';
  // ... etc
  
  const handlers: Array<(message: string, explicitDirectionIntent: 'in' | 'out' | null) => Promise<{ handled: boolean; response?: string }>> = [
    // List all legacy handlers here
    // handleDirectionClarification,
    // handleSplitBillShareResponse,
    // handleCountCorrection,
    // handleBulkDirectionCorrection,
    // handleFillDetails,
    // handleCorrection,
    // handleExtraction,
    // handleNormalResponse,
    // handleMood
  ];

  let assistantResponse = '';

  try {
    for (const h of handlers) {
      const res = await h(message, explicitDirectionIntent);
      if (res?.handled) {
        assistantResponse = res.response ?? '';
        console.log(`[sendMessage] Message handled by: ${h.name}`);
        break;
      }
    }

    if (!assistantResponse) {
      console.log('[sendMessage] No handler processed the message.');
    }
  } catch (err) {
    assistantResponse = handleProcessingError(err);
  } finally {
    finishProcessing(assistantResponse);
  }
}