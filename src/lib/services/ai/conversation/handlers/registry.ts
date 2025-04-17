// src/lib/services/ai/conversation/handlers/registry.ts
import type { Handler, HandlerRegistration, Middleware, HandlerContext, HandlerResult, MiddlewareNext } from './types';

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
      for (const { name, handler } of this.handlers) {
        try {
          const result = await handler(context);
          if (result.handled) {
            console.log(`[HandlerRegistry] Message handled by: ${name}`);
            return result;
          }
        } catch (error) {
          console.error(`[HandlerRegistry] Error in handler ${name}:`, error);
          throw error; // Let middleware handle errors
        }
      }

      // No handler processed the message
      console.log('[HandlerRegistry] No handler processed the message');
      return { handled: false };
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