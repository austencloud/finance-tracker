// src/lib/services/ai/conversation/handlers/types.ts
import type { ConversationState, Transaction } from '$lib/types/types';

/**
 * Context object passed to all handlers containing relevant information
 */
export type HandlerContext = {
	// Original inputs
	message: string;
	explicitDirectionIntent: 'in' | 'out' | null;

	// State enriched by middleware
	conversationState?: ConversationState;
	internalState?: ConversationState['_internal'];

	// Additional dynamic properties
	[key: string]: any;
};

/**
 * Result returned from a handler
 */
export type HandlerResult = {
	handled: boolean;
	response?: string;
	extractedCount?: number;
	transactions?: Transaction[];

	// Additional dynamic properties
	[key: string]: any;
};

/**
 * Handler function type - processes a message and returns a result
 */
export type Handler = (context: HandlerContext) => Promise<HandlerResult>;

/**
 * Function to call the next middleware or handler in the chain
 */
export type MiddlewareNext = () => Promise<HandlerResult>;

/**
 * Middleware function type - can process context before/after handlers
 */
export type Middleware = (context: HandlerContext, next: MiddlewareNext) => Promise<HandlerResult>;

/**
 * Handler registration metadata
 */
export interface HandlerRegistration {
	name: string;
	handler: Handler;
	priority: number;
}
