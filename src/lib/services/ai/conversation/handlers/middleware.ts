// src/lib/services/ai/conversation/handlers/middleware.ts
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { getLLMFallbackResponse } from '$lib/services/ai/llm-helpers';
import type { Middleware } from './types';

/**
 * Middleware to track performance of handlers
 */
export const performanceMiddleware: Middleware = async (context, next) => {
	const start = performance.now();
	const result = await next();
	const duration = performance.now() - start;

	if (result.handled) {
		console.log(`[Performance] Handler took ${duration.toFixed(2)}ms`);
	}

	return result;
};

/**
 * Middleware to enrich context with conversation state
 */
export const conversationStateMiddleware: Middleware = async (context, next) => {
	// Add conversation state to context
	const state = get(conversationStore);
	context.conversationState = state;
	context.internalState = state._internal;

	return next();
};

/**
 * Error handling middleware
 */
export const errorHandlingMiddleware: Middleware = async (context, next) => {
	try {
		return await next();
	} catch (error) {
		console.error('[Handler] Caught error in handler chain:', error);

		conversationStore.setStatus('Error processing message');
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);

		return {
			handled: true,
			response: errorMsg
		};
	}
};

/**
 * Logging middleware
 */
export const loggingMiddleware: Middleware = async (context, next) => {
	console.log(
		`[Handler] Processing: "${context.message.substring(0, 500)}${context.message.length > 500 ? '...' : ''}"`
	);

	const result = await next();

	if (result.handled) {
		console.log(
			`[Handler] Result: handled=${result.handled}, response=${result.response?.substring(0, 500)}${result.response && result.response.length > 500 ? '...' : ''}`
		);
	} else {
		console.log(`[Handler] Result: handled=false (not handled)`);
	}

	return result;
};

/**
 * Transaction auto-add middleware
 * Automatically adds transactions if they're present in the result
 */
export const transactionAutoAddMiddleware: Middleware = async (context, next) => {
	// 1. Run the handler and get the result
	const result = await next();

	// 2. Check if the handler returned transactions to be added
	if (result.handled && result.transactions && result.transactions.length > 0) {
		// 3. Dynamically import the store
		// Note: Consider if dynamic import is truly needed or if it can be imported at the top
		const { transactionStore } = await import('$lib/stores/transactionStore');

		// 4. Perform the side effect: Add transactions to the store
		transactionStore.add(result.transactions);

		console.log(
			`[Middleware] transactionAutoAddMiddleware: Added ${result.transactions.length} transaction(s) to the store.`
		);

		// 5. --- REMOVE THE RESPONSE AUGMENTATION ---
		// The handler (e.g., extractionHandler) is responsible for crafting
		// the appropriate user-facing confirmation message in its result.response.
		// This middleware should focus solely on the side effect of adding to the store.
		/*
        // Augment the response to mention the added transactions // <-- REMOVE THIS BLOCK
        if (result.response) {
            result.response += ` Added ${result.transactions.length} transaction(s).`;
        } else {
            result.response = `Added ${result.transactions.length} transaction(s).`;
        }
        */
		// --- END REMOVED BLOCK ---
	}

	// 6. Return the original result object from the handler
	//    (The handler's response string remains untouched by this middleware)
	return result;
};
