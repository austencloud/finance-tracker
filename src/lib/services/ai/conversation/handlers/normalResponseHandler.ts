// src/lib/services/ai/conversation/handlers/normalResponseHandler.ts
import { createConditionalHandler } from './factories';
import { get } from 'svelte/store';
import { conversationStore } from '$lib/stores/conversationStore';
import { llmChat, getLLMFallbackResponse } from '../../llm-helpers';
import type { ConversationMessage } from '$lib/types/types';
import type { HandlerContext } from './types';
import { getSystemPrompt } from '../../prompts/systemPrompts';

/**
 * Handler for general conversation that isn't handled by other more specific handlers.
 * This is typically registered with the lowest priority so it acts as a fallback.
 */
export const normalResponseHandler = createConditionalHandler(
	{
		// This handler should try to handle any message, so no specific conditions
		// We use a simple always-true check
		customCheck: () => true
	},
	async (context: HandlerContext) => {
		const { message } = context;

		console.log('[NormalResponseHandler] Handling as general conversation.');
		conversationStore.setStatus('Thinking...', 50);

		try {
			const today = new Date().toISOString().split('T')[0];
			// Get conversation history from the store
			const conversationState = get(conversationStore);
			const history = conversationState.messages;

			// Basic check if history is valid
			if (!Array.isArray(history)) {
				console.warn(
					'[NormalResponseHandler] Conversation history is not an array. Using minimal context.'
				);
				// Fallback with minimal context
				const simpleMessages = [
					{ role: 'system' as const, content: getSystemPrompt(today) },
					{ role: 'user' as const, content: message }
				];
				const aiResponse = await llmChat(simpleMessages, {
					temperature: 0.7,
					rawUserText: message
				});

				if (!aiResponse?.trim()) {
					throw new Error('AI returned an empty fallback response.');
				}

				return { response: aiResponse };
			}

			// Prepare messages for the AI, including recent history
			const currentMessage = history.length > 0 ? history[history.length - 1] : null;

			if (!currentMessage || currentMessage.role !== 'user' || currentMessage.content !== message) {
				// This case might happen if startProcessing failed or logic changed
				// Handle defensively by sending system + current user message only
				console.warn('[NormalResponseHandler] History state mismatch, sending minimal context.');
				const minimalMessages = [
					{ role: 'system' as const, content: getSystemPrompt(today) },
					{ role: 'user' as const, content: message }
				];
				const aiResponse = await llmChat(minimalMessages, {
					temperature: 0.7,
					rawUserText: message
				});

				if (!aiResponse?.trim()) {
					throw new Error('AI returned an empty response.');
				}

				return { response: aiResponse };
			}

			// Construct message history for LLM (limit context length)
			const messagesToAi = [
				{ role: 'system' as const, content: getSystemPrompt(today) },
				// Include recent history (last 8 messages, excluding current)
				...history.slice(-9, -1).map((msg: ConversationMessage) => ({
					role: msg.role,
					content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
				})),
				// Add the current user message
				{ role: currentMessage.role, content: currentMessage.content }
			];

			// Call LLM
			const aiResponse = await llmChat(messagesToAi, { temperature: 0.7, rawUserText: message });

			if (!aiResponse?.trim()) {
				// Handle empty response
				console.warn('[NormalResponseHandler] AI returned an empty response.');
				return { response: "Sorry, I'm not sure how to respond to that." };
			}

			// Return successful response
			return { response: aiResponse };
		} catch (error) {
			console.error('[NormalResponseHandler] Error during AI chat:', error);
			const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
			conversationStore.setStatus('Error generating response');

			return { response: errorMsg };
		}
	}
);

// Legacy export for backward compatibility during migration
export async function handleNormalResponse(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return normalResponseHandler({
		message,
		explicitDirectionIntent
	});
}
