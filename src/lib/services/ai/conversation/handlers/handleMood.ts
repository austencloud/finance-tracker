// --- FILENAME: src/lib/services/ai/conversation/handlers/handleMood.ts ---

// --- REMOVE old store import ---
// import { conversationStore } from '../conversationStore';
// --- Import central store ---
import { appStore } from '$lib/stores/AppStore';

/**
 * Handles non-transactional, mood-based, or simple conversational inputs.
 * Examples: "Hello", "Thanks", "How are you?", "Okay", "Sounds good".
 * Uses appStore actions to add messages directly for greetings/thanks.
 * Returns response strings for affirmations/questions to be added by the service.
 *
 * @param message The user's input message.
 * @param explicitDirectionIntent Optional direction hint (ignored by this handler).
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleMood(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null // Keep signature consistent
): Promise<{ handled: boolean; response?: string }> {
	const lowerMessage = message.toLowerCase().trim();
	const simpleGreetings = ['hello', 'hi', 'hey', 'yo'];
	const simpleThanks = ['thanks', 'thank you', 'thx', 'ty'];
	const simpleAffirmations = ['ok', 'okay', 'sounds good', 'got it', 'cool'];
	const simpleQuestions = ['how are you', 'what can you do'];

	if (simpleGreetings.some((g) => lowerMessage.startsWith(g))) {
		// --- Respond directly using appStore action ---
		appStore.addConversationMessage(
			'assistant',
			'Hello there! How can I help you with your transactions today?'
		);
		// Indicate handled, no response string needed as message was added directly.
		// The service's finishProcessing won't run if no response string is returned.
		return { handled: true };
	}

	if (simpleThanks.some((t) => lowerMessage.includes(t))) {
		// --- Respond directly using appStore action ---
		appStore.addConversationMessage('assistant', "You're welcome!");
		// Indicate handled, no response string needed.
		return { handled: true };
	}

	if (simpleAffirmations.some((a) => lowerMessage === a)) {
		// Often follows an action. Provide a minimal response string
		// for the service layer to add via finishProcessing.
		return { handled: true, response: 'Okay.' };
	}

	if (simpleQuestions.some((q) => lowerMessage.includes(q))) {
		const response =
			"I'm an AI assistant designed to help you extract and organize transaction data from text or descriptions. Just paste your data or tell me about your spending!";
		// Return the response string for the service layer to add.
		return { handled: true, response: response };
	}

	// If none of the simple cases match, it's not handled by this handler.
	return { handled: false };
}
