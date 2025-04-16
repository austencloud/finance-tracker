// src/lib/services/ai/conversation/handlers/handleNormalResponse.ts

// --- Import appStore and get ---
import { appStore } from '$lib/stores/AppStore';
import { get } from 'svelte/store';

// --- REMOVE old store imports ---
// import { conversationStore } from '../conversationStore';
// import { conversationMessages } from '../conversationDerivedStores';

// --- Keep other necessary imports ---
import { deepseekChat, getFallbackResponse } from '../../deepseek-client';
import { getSystemPrompt } from '../../prompts';
import type { ConversationMessage } from '$lib/stores/types'; // Import type if needed

/**
 * Handles general conversation using appStore.
 */
export async function handleNormalResponse(
	message: string
): Promise<{ handled: boolean; response?: string }> {
	console.log('[NormalResponseHandler] Handling as general conversation.');
	// --- Update status via appStore action ---
	appStore.setConversationStatus('Thinking...', 50);

	try {
		const today = new Date().toISOString().split('T')[0];
		// --- Read history from appStore state ---
		const history = get(appStore).conversation.messages;

		// Check if history is an array (basic check, should always be true now)
		if (!Array.isArray(history)) {
			console.warn('[NormalResponseHandler] Conversation history is not an array.');
			// Fallback gracefully
			const simpleMessages = [
				{ role: 'system', content: getSystemPrompt(today) },
				{ role: 'user', content: message } // Send only system and user prompt
			];
			const aiResponse = await deepseekChat(simpleMessages, { temperature: 0.7 });
			if (!aiResponse?.trim()) {
				throw new Error('AI returned an empty fallback response.');
			}
			// Note: Status isn't updated on success here, letting finishProcessing handle it
			return { handled: true, response: aiResponse };
		}

		// Prepare messages for the AI, including history context
		// Get the latest user message (which `sendMessage` added before calling handlers)
		const currentMessage = history[history.length - 1];
		const messagesToAi = [
			{ role: 'system', content: getSystemPrompt(today) },
			// Include recent history (excluding the current user message which is last)
			...history.slice(-7, -1).map((msg: ConversationMessage) => ({
				// Get up to 6 previous messages
				role: msg.role,
				content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) // Handle potential non-string content defensively
			})),
			// Add the current user message back
			{ role: currentMessage.role, content: currentMessage.content }
		];

		const aiResponse = await deepseekChat(messagesToAi, { temperature: 0.7 });

		if (!aiResponse?.trim()) {
			throw new Error('AI returned an empty response.');
		}

		// Note: We don't call setConversationStatus on success here.
		// The calling function (sendMessage -> finishProcessing) will handle setting
		// the final status after adding the assistant message.
		return { handled: true, response: aiResponse };
	} catch (error) {
		console.error('[NormalResponseHandler] Error during AI chat:', error);
		const errorMsg = getFallbackResponse(error instanceof Error ? error : undefined);
		// --- Update status via appStore action ---
		appStore.setConversationStatus('Error generating response'); // Set error status
		return { handled: true, response: errorMsg }; // Still handled (by error), return error message
	}
	// Note: No need for a finally block to reset processing state here,
	// as the main `sendMessage` function's finally block handles that.
}
