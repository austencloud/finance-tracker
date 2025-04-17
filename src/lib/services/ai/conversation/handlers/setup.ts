// src/lib/services/ai/conversation/handlers/setup.ts
import { conversationHandlerRegistry } from './registry';
import {
	errorHandlingMiddleware,
	performanceMiddleware,
	conversationStateMiddleware,
	loggingMiddleware,
	transactionAutoAddMiddleware
} from './middleware';

// Import handlers with their new exports
import { moodHandler } from './moodHandler';
import {
	enhancedSplitBillHandler,
	splitBillShareHandler,
	splitBillDetectionHandler
} from './splitBillHandler';
import { directionClarificationHandler } from './directionClarificationHandler';
import { correctionHandler } from './correctionHandler';
import { extractionHandler } from './extractionHandler';
import { duplicateConfirmationHandler } from './duplicateConfirmationHandler';
import { countCorrectionHandler } from './countCorrectionHandler';
import { bulkDirectionCorrectionHandler } from './bulkDirectionCorrectionHandler';
import { fillDetailsHandler } from './fillDetailsHandler';
import { normalResponseHandler } from './normalResponseHandler';
import { bulkDataHandler } from './bulkDataHandler';

/**
 * Setup handler registry with all handlers and middleware
 */
export function setupHandlers() {
	// Register middleware in order (first registered runs first)
	conversationHandlerRegistry.use(errorHandlingMiddleware);
	conversationHandlerRegistry.use(loggingMiddleware);
	conversationHandlerRegistry.use(performanceMiddleware);
	conversationHandlerRegistry.use(conversationStateMiddleware);
	conversationHandlerRegistry.use(transactionAutoAddMiddleware);

	// Register handlers in priority order (lower number = higher priority)
	// Priority order is important - more specific handlers come first
	conversationHandlerRegistry.register('directionClarification', directionClarificationHandler, 10);
	conversationHandlerRegistry.register('splitBillShare', splitBillShareHandler, 20);
	conversationHandlerRegistry.register('duplicateConfirmation', duplicateConfirmationHandler, 30);
	conversationHandlerRegistry.register('countCorrection', countCorrectionHandler, 40);
	conversationHandlerRegistry.register(
		'bulkDirectionCorrection',
		bulkDirectionCorrectionHandler,
		50
	);
	conversationHandlerRegistry.register('fillDetails', fillDetailsHandler, 60);
	conversationHandlerRegistry.register('correction', correctionHandler, 70);
	conversationHandlerRegistry.register('enhancedSplitBill', enhancedSplitBillHandler, 75); // LLM-based handler takes priority
	conversationHandlerRegistry.register('splitBillDetection', splitBillDetectionHandler, 80); // Legacy regex handler as fallback
	conversationHandlerRegistry.register('bulkData', bulkDataHandler, 85); // High priority but after specific handlers
	conversationHandlerRegistry.register('extraction', extractionHandler, 90);
	conversationHandlerRegistry.register('mood', moodHandler, 100);
	conversationHandlerRegistry.register('normalResponse', normalResponseHandler, 999); // Fallback

	// Return the built handler chain
	return conversationHandlerRegistry.buildChain();
}

// Create singleton for easy imports
let handlerChain: ReturnType<typeof conversationHandlerRegistry.buildChain> | null = null;

/**
 * Get the configured handler chain (lazy initialization)
 */
export function getHandlerChain() {
	if (!handlerChain) {
		handlerChain = setupHandlers();
	}
	return handlerChain;
}
