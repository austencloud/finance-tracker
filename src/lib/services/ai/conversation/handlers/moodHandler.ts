// src/lib/services/ai/conversation/handlers/moodHandler.ts
import { createConditionalHandler } from './factories';
import { conversationStore } from '$lib/stores/conversationStore';
import type { HandlerContext } from './types';

// Define constants outside handler for better performance
const GREETING_REGEX = /^(hello|hi|hey|yo|greetings|good morning|good afternoon)/i;
const THANKS_REGEX = /\b(thanks|thank you|thx|ty|cheers|appreciated)\b/i;
const AFFIRMATION_REGEX = /^(ok|okay|sounds good|got it|cool|alright|sure)$/i;
const QUESTION_REGEX = /\b(how are you|what can you do|help)\b/i;

/**
 * Handler for basic conversation responses (greetings, thanks, etc.)
 * Uses a conditional handler that only activates for certain message patterns.
 */
export const moodHandler = createConditionalHandler(
	{
		// Use keywords for initial filtering (more efficient than regex for large sets)
		keywords: [
			'hello',
			'hi',
			'hey',
			'yo',
			'greetings',
			'good',
			'thanks',
			'thank',
			'thx',
			'ty',
			'cheers',
			'appreciated',
			'ok',
			'okay',
			'sounds',
			'got',
			'cool',
			'alright',
			'sure',
			'how',
			'what',
			'help'
		],
		// Use custom check for more precise matching
		customCheck: (message) => {
			const lowerMsg = message.toLowerCase().trim();
			return (
				GREETING_REGEX.test(lowerMsg) ||
				THANKS_REGEX.test(lowerMsg) ||
				AFFIRMATION_REGEX.test(lowerMsg) ||
				QUESTION_REGEX.test(lowerMsg)
			);
		}
	},
	// The actual handler logic
	async (context: HandlerContext) => {
		const { message } = context;
		const lowerMessage = message.toLowerCase().trim();

		// Handle different types of conversational messages
		if (GREETING_REGEX.test(lowerMessage)) {
			conversationStore.addMessage(
				'assistant',
				'Hello there! How can I help you with your transactions today?'
			);
			return {}; // Empty result means no response needed (already added directly)
		}

		if (THANKS_REGEX.test(lowerMessage)) {
			conversationStore.addMessage('assistant', "You're welcome!");
			return {};
		}

		if (AFFIRMATION_REGEX.test(lowerMessage)) {
			return { response: 'Okay.' };
		}

		if (QUESTION_REGEX.test(lowerMessage)) {
			return {
				response:
					"I'm an AI assistant designed to help you extract and organize transaction data. Just paste your transaction data or tell me about your spending!"
			};
		}

		// Fallback response if none of the specific patterns match
		return { response: "I'm here to help with your transactions!" };
	}
);

// Legacy export for backward compatibility during migration
export async function handleMood(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	return moodHandler({
		message,
		explicitDirectionIntent
	});
}
