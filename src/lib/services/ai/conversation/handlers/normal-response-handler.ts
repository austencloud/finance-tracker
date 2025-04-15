// src/lib/services/ai/conversation/handlers/normal-response-handler.ts
import { conversationStore } from '../conversationStore';
import { get } from 'svelte/store';
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt } from '../../prompts';
import { conversationMessages } from '../conversationDerivedStores';

/**
 * Handles general conversation or questions that weren't caught by more specific handlers.
 * This acts as a fallback to use the AI for a conversational response.
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and the AI's response.
 */
export async function handleNormalResponse(
	message: string
): Promise<{ handled: boolean; response?: string }> {
	console.log('[NormalResponseHandler] Handling as general conversation.');
	conversationStore._updateStatus('Thinking...', 50); // General thinking status

	try {
		const today = new Date().toISOString().split('T')[0];
		const history = get(conversationMessages); // Get current history from store

		// Check if history is an array and has elements
		if (!Array.isArray(history)) {
			console.warn('[NormalResponseHandler] Conversation history is not an array.');
			// Handle gracefully with default behavior
			const simpleMessages = [
				{ role: 'system', content: getSystemPrompt(today) },
				{ role: 'user', content: message }
			];
			const aiResponse = await deepseekChat(simpleMessages, { temperature: 0.7 });
			if (!aiResponse || !aiResponse.trim()) {
				throw new Error('AI returned an empty response.');
			}
			return { handled: true, response: aiResponse };
		}

		// Prepare messages for the AI, including history context
		const messagesToAi = [
			{ role: 'system', content: getSystemPrompt(today) },
			// Include recent history (limit length/tokens appropriately)
			...history.slice(-6).map((msg) => ({
				role: msg.role,
				content: typeof msg.content === 'string' ? msg.content : ''
			})) // Last 6 messages
			// Add the current user message (already added by startProcessing)
			// { role: 'user', content: message } // Service adds user message, don't duplicate
		];

		// Filter out the user message we are currently processing if it's already in history
		// The service adds the user message *before* calling handlers.
		// Let's ensure the last message isn't duplicated if history includes it.
		// Note: The service adds the user message *before* calling handlers, so it will be the last item in history.
		// We actually *do* want the AI to see the latest user message in context.

		const aiResponse = await deepseekChat(messagesToAi, { temperature: 0.7 }); // Higher temp for conversation

		if (!aiResponse || !aiResponse.trim()) {
			throw new Error('AI returned an empty response.');
		}

		conversationStore._updateStatus('Response generated', 100);
		return { handled: true, response: aiResponse };
	} catch (error) {
		console.error('[NormalResponseHandler] Error during AI chat:', error);
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		conversationStore._updateStatus('Error generating response');
		return { handled: true, response: errorMsg }; // Handled the attempt, but failed
	}
}
