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
		`[Handler] Processing: "${context.message.substring(0, 50)}${context.message.length > 50 ? '...' : ''}"`
	);

	const result = await next();

	if (result.handled) {
		console.log(
			`[Handler] Result: handled=${result.handled}, response=${result.response?.substring(0, 50)}${result.response && result.response.length > 50 ? '...' : ''}`
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
	const result = await next();

	if (result.handled && result.transactions && result.transactions.length > 0) {
		// Dynamically import to avoid circular dependencies
		const { transactionStore } = await import('$lib/stores/transactionStore');
		transactionStore.add(result.transactions);

		// Augment the response to mention the added transactions
		if (result.response) {
			result.response += ` Added ${result.transactions.length} transaction(s).`;
		} else {
			result.response = `Added ${result.transactions.length} transaction(s).`;
		}
	}

	return result;
};
