// src/lib/services/ai/conversation/handlers/registry.ts
import type {
	Handler,
	HandlerRegistration,
	Middleware,
	HandlerContext,
	HandlerResult,
	MiddlewareNext
} from './types';

/**
 * Registry for managing conversation handlers with middleware support
 */
export class HandlerRegistry {
	private handlers: HandlerRegistration[] = [];
	private middleware: Middleware[] = [];

	/**
	 * Register a handler with a name and priority
	 * @param name Unique name for the handler
	 * @param handler Handler function
	 * @param priority Priority (lower number = higher priority)
	 */
	register(name: string, handler: Handler, priority: number = 100): this {
		this.handlers.push({ name, handler, priority });
		// Sort handlers by priority after each registration
		this.handlers.sort((a, b) => a.priority - b.priority);
		return this;
	}

	/**
	 * Add middleware to the handler chain
	 * @param middleware Middleware function
	 */
	use(middleware: Middleware): this {
		this.middleware.push(middleware);
		return this;
	}

	/**
	 * List all registered handlers
	 */
	getHandlers(): HandlerRegistration[] {
		return [...this.handlers];
	}

	/**
	 * Build the final handler chain with middleware applied
	 */
	buildChain(): Handler {
		// Create the base handler chain without middleware
		const baseHandler = async (context: HandlerContext): Promise<HandlerResult> => {
			// Create a copy of the handlers array to iterate through
			const handlers = [...this.handlers];
			let currentHandlerIndex = 0;
			let finalResponse: string | undefined = undefined;
			let isHandled = false;

			// Create the middleware chain
			const runMiddleware = (index: number, ctx: HandlerContext): Promise<HandlerResult> => {
				// If we've run through all middleware, execute the handler chain
				if (index >= this.middleware.length) {
					return runHandlers(ctx);
				}

				// Execute the current middleware with the next middleware as the next function
				const currentMiddleware = this.middleware[index];
				return currentMiddleware(ctx, () => runMiddleware(index + 1, ctx));
			};

			// Create the handler execution chain
			const runHandlers = async (ctx: HandlerContext): Promise<HandlerResult> => {
				// If we've run through all handlers, return a fallback result
				if (currentHandlerIndex >= handlers.length) {
					return {
						handled: isHandled,
						response: finalResponse
					};
				}

				// Get the current handler
				const { name, handler } = handlers[currentHandlerIndex];
				// Increment for the next handler
				currentHandlerIndex++;

				try {
					// Execute the current handler
					const result = await handler(ctx);

					// Support for chainResponse property to chain handler responses together
					if (result.handled === false && result.chainResponse === true && result.response) {
						// Store the response but continue to next handler
						finalResponse = result.response;

						// Run the next handler
						const nextResult = await runHandlers(ctx);

						// Combine responses if the next handler produced a response
						if (nextResult.response) {
							return {
								...nextResult,
								response: `${finalResponse} ${nextResult.response}`,
								handled: true
							};
						}

						// If no further handler produced a response, return this one
						return {
							handled: true,
							response: finalResponse
						};
					}

					// If the handler handled the request, return its result
					if (result.handled) {
						return result;
					}

					// Otherwise, try the next handler
					return runHandlers(ctx);
				} catch (error) {
					console.error(`[HandlerRegistry] Error in handler ${name}:`, error);
					// Continue to the next handler
					return runHandlers(ctx);
				}
			};

			// Start the middleware chain
			return runMiddleware(0, context);
		};

		// Apply middleware in reverse order so first registered runs first
		return this.middleware.reduceRight<Handler>(
			(nextHandler, currentMiddleware) => {
				// Return a new handler that applies the current middleware
				return async (context: HandlerContext): Promise<HandlerResult> => {
					// Create a next function that calls the next handler in the chain
					const next: MiddlewareNext = async () => {
						return nextHandler(context);
					};

					// Apply the middleware with context and next function
					return currentMiddleware(context, next);
				};
			},
			// Start with the base handler
			baseHandler
		);
	}
}

// Singleton instance - can be shared across the application
export const conversationHandlerRegistry = new HandlerRegistry();
