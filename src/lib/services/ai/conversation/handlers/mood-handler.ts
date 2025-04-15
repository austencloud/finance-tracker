// --- FILENAME: src/lib/services/ai/conversation/handlers/mood-handler.ts ---

import { conversationStore } from '../conversationStore';

/**
 * Handles non-transactional, mood-based, or simple conversational inputs.
 * Examples: "Hello", "Thanks", "How are you?", "Okay", "Sounds good".
 *
 * @param message The user's input message.
 * @returns An object indicating if the message was handled and an optional response.
 * This handler might directly add messages and reset state for simple interactions.
 */
export async function handleMood(
	message: string
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();
	const simpleGreetings = ['hello', 'hi', 'hey', 'yo'];
	const simpleThanks = ['thanks', 'thank you', 'thx', 'ty'];
	const simpleAffirmations = ['ok', 'okay', 'sounds good', 'got it', 'cool'];
	const simpleQuestions = ['how are you', 'what can you do'];

	if (simpleGreetings.some((g) => lowerMessage.startsWith(g))) {
		// Respond directly and potentially reset processing if it was just a greeting
		conversationStore._addMessage(
			'assistant',
			'Hello there! How can I help you with your transactions today?'
		);
		// Decide if this should reset processing. If the user just said "Hi", maybe not.
		// If the app was in an error state, maybe reset?
		// For now, let's assume it doesn't stop other processing unless the service decides.
		// We won't return a response string here, as we added the message directly.
		// We also won't set processing to false here, let the service handle the flow.
		return { handled: true };
	}

	if (simpleThanks.some((t) => lowerMessage.includes(t))) {
		conversationStore._addMessage('assistant', "You're welcome!");
		return { handled: true };
	}

	if (simpleAffirmations.some((a) => lowerMessage === a)) {
		// Often follows an action. Might not need a response,
		// or could be a generic "Okay, what's next?"
		// Let's provide a minimal response that the service can use.
		return { handled: true, response: 'Okay.' };
	}

	if (simpleQuestions.some((q) => lowerMessage.includes(q))) {
		const response =
			"I'm an AI assistant designed to help you extract and organize transaction data from text or descriptions. Just paste your data or tell me about your spending!";
		// The service will add this response via finishProcessing
		return { handled: true, response: response };
	}

	// If none of the simple cases match, it's not handled by this handler.
	return { handled: false };
}
