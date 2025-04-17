// src/lib/services/ai/conversation/handlers/factories.ts
import type { Handler, HandlerContext, HandlerResult } from './types';

/**
 * Creates a handler that only processes messages matching specified conditions
 */
export function createConditionalHandler(
	conditions: {
		regex?: RegExp[];
		keywords?: string[];
		customCheck?: (message: string) => boolean;
	},
	handlerFn: (context: HandlerContext) => Promise<Omit<HandlerResult, 'handled'>>
): Handler {
	return async (context: HandlerContext) => {
		const { message } = context;
		const lowerMessage = message.toLowerCase().trim();

		// Check regex patterns
		const regexMatch =
			!conditions.regex || conditions.regex.some((pattern) => pattern.test(message));

		// Check keywords
		const keywordMatch =
			!conditions.keywords || conditions.keywords.some((keyword) => lowerMessage.includes(keyword));

		// Check custom function
		const customMatch = !conditions.customCheck || conditions.customCheck(message);

		// If any condition fails, don't handle
		if (!(regexMatch && keywordMatch && customMatch)) {
			return { handled: false };
		}

		// Process the message with the handler function
		try {
			const result = await handlerFn(context);
			return { ...result, handled: true };
		} catch (error) {
			console.error(`[ConditionalHandler] Error:`, error);
			throw error; // Let middleware handle it
		}
	};
}

/**
 * Creates a handler that requires specific conversation state
 */
export function createStateAwareHandler(
	stateCheck: (context: HandlerContext) => boolean,
	handlerFn: (context: HandlerContext) => Promise<Omit<HandlerResult, 'handled'>>
): Handler {
	return async (context: HandlerContext) => {
		// If state check fails, don't handle
		if (!stateCheck(context)) {
			return { handled: false };
		}

		// Process with handler function
		try {
			const result = await handlerFn(context);
			return { ...result, handled: true };
		} catch (error) {
			console.error(`[StateAwareHandler] Error:`, error);
			throw error; // Let middleware handle it
		}
	};
}

/**
 * Creates a handler that combines multiple sub-handlers
 * Returns the result of the first sub-handler that handles the message
 */
export function createCompositeHandler(handlers: Handler[]): Handler {
	return async (context: HandlerContext) => {
		for (const handler of handlers) {
			const result = await handler(context);
			if (result.handled) {
				return result;
			}
		}
		return { handled: false };
	};
}

/**
 * Creates a handler with automatic retry capability
 */
export function createRetryableHandler(
	handler: Handler,
	maxRetries: number = 3,
	shouldRetry: (error: any) => boolean = () => true
): Handler {
	return async (context: HandlerContext) => {
		let lastError: any;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await handler(context);
			} catch (error) {
				lastError = error;
				if (!shouldRetry(error) || attempt === maxRetries) {
					throw error;
				}
				console.log(
					`[RetryableHandler] Retrying after error (${attempt + 1}/${maxRetries + 1}):`,
					error
				);
				// Optional: Add exponential backoff here
				await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
			}
		}

		// This should never happen due to the throw in the loop
		throw lastError;
	};
}
