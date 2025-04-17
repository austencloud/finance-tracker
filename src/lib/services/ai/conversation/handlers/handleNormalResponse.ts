// src/lib/services/ai/conversation/handlers/handleNormalResponse.ts

// --- Import conversationStore and get ---
import { conversationStore } from '$lib/stores/conversationStore';
import { get } from 'svelte/store';

// --- Keep other necessary imports ---
import { llmChat, getLLMFallbackResponse } from '../../llm-helpers'; // Adjust path
import { getSystemPrompt } from '../../prompts'; // Adjust path
import type { ConversationMessage } from '$lib/types/types'; // Adjust path

/**
 * Handles general conversation or messages not caught by more specific handlers.
 * Uses conversationStore to access message history and update status.
 * Calls the LLM to generate a conversational response.
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and the AI's response.
 */
export async function handleNormalResponse(
	message: string
	// explicitDirectionIntent is not used by this handler, but kept for consistent signature
	// explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	console.log('[NormalResponseHandler] Handling as general conversation.');
	// --- Update status via conversationStore action ---
	conversationStore.setStatus('Thinking...', 50); // Correct action call

	try {
		const today = new Date().toISOString().split('T')[0];
		// --- Read history directly from conversationStore state ---
		const conversationState = get(conversationStore); // Get the whole state once
		const history = conversationState.messages; // Access messages property

		// Basic check if history is valid
		if (!Array.isArray(history)) {
			console.warn(
				'[NormalResponseHandler] Conversation history is not an array. Using minimal context.'
			);
			// Fallback gracefully with minimal context
			const simpleMessages = [
				{ role: 'system' as const, content: getSystemPrompt(today) },
				{ role: 'user' as const, content: message }
			];
			const aiResponse = await llmChat(simpleMessages, { temperature: 0.7, rawUserText: message });
			if (!aiResponse?.trim()) {
				throw new Error('AI returned an empty fallback response.');
			}
			// Let finishProcessing handle final status update
			return { handled: true, response: aiResponse };
		}

		// --- Prepare messages for the AI, including history context ---
		// Ensure currentMessage exists (it should have been added by startProcessing)
		const currentMessage = history.length > 0 ? history[history.length - 1] : null;

		if (!currentMessage || currentMessage.role !== 'user' || currentMessage.content !== message) {
			// This case might happen if startProcessing failed or logic changed.
			// Handle defensively by just sending system + current user message.
			console.warn('[NormalResponseHandler] History state mismatch, sending minimal context.');
			const minimalMessages = [
				{ role: 'system' as const, content: getSystemPrompt(today) },
				{ role: 'user' as const, content: message }
			];
			const aiResponse = await llmChat(minimalMessages, { temperature: 0.7, rawUserText: message });
			if (!aiResponse?.trim()) {
				throw new Error('AI returned an empty response.');
			}
			return { handled: true, response: aiResponse };
		}

		// Construct message history for LLM (limit context length)
		const messagesToAi = [
			{ role: 'system' as const, content: getSystemPrompt(today) },
			// Include recent history (e.g., last 6 messages = 3 turns, excluding current user message)
			...history.slice(-9, -1).map((msg: ConversationMessage) => ({
				role: msg.role, // Role should already be correct type
				// Ensure content is stringified if it's not already (though it should be)
				content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
			})),
			// Add the current user message itself
			{ role: currentMessage.role, content: currentMessage.content }
		];

		// --- Call LLM ---
		const aiResponse = await llmChat(messagesToAi, { temperature: 0.7, rawUserText: message });

		if (!aiResponse?.trim()) {
			// Handle empty response from LLM
			console.warn('[NormalResponseHandler] AI returned an empty response.');
			// Provide a generic fallback
			return { handled: true, response: "Sorry, I'm not sure how to respond to that." };
		}

		// Success: Return the AI response for the service layer to add
		// The service's finishProcessing will update the status
		return { handled: true, response: aiResponse };
	} catch (error) {
		console.error('[NormalResponseHandler] Error during AI chat:', error);
		const errorMsg = getLLMFallbackResponse(error instanceof Error ? error : undefined);
		// --- Update status via conversationStore action ---
		conversationStore.setStatus('Error generating response'); // Correct action call
		return { handled: true, response: errorMsg }; // Still handled (by error), return error message
	}
	// No finally block needed here, finishProcessing in conversationService handles it
}
