// src/lib/services/ai/conversation/handlers/handleMood.ts

// --- Import specific stores ---
import { conversationStore } from '$lib/stores/conversationStore';
// import { get } from 'svelte/store'; // 'get' is not needed here

/**
 * Handles non-transactional, mood-based, or simple conversational inputs.
 * Examples: "Hello", "Thanks", "How are you?", "Okay", "Sounds good".
 * Adds direct responses for greetings/thanks via conversationStore.
 * Returns response strings for affirmations/questions to be added by the service layer.
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

	// Define lists of simple conversational patterns
	const simpleGreetings = [
		'hello',
		'hi',
		'hey',
		'yo',
		'greetings',
		'good morning',
		'good afternoon'
	];
	const simpleThanks = ['thanks', 'thank you', 'thx', 'ty', 'cheers', 'appreciated'];
	const simpleAffirmations = ['ok', 'okay', 'sounds good', 'got it', 'cool', 'alright', 'sure'];
	const simpleQuestions = ['how are you', 'what can you do', 'help'];

	// Check for greetings
	if (simpleGreetings.some((g) => lowerMessage.startsWith(g))) {
		// --- Respond directly using conversationStore action ---
		conversationStore.addMessage(
			'assistant',
			'Hello there! How can I help you with your transactions today?'
		);
		// Indicate handled; no response string needed as message was added directly.
		return { handled: true };
	}

	// Check for thanks
	if (simpleThanks.some((t) => lowerMessage.includes(t))) {
		// --- Respond directly using conversationStore action ---
		conversationStore.addMessage('assistant', "You're welcome!");
		// Indicate handled; no response string needed.
		return { handled: true };
	}

	// Check for simple affirmations (often follow an action)
	if (simpleAffirmations.some((a) => lowerMessage === a)) {
		// Provide a minimal response string for the service layer to add.
		// Avoids adding redundant "Okay." if the previous action already confirmed.
		// Consider returning handled: true without a response if preferred.
		return { handled: true, response: 'Okay.' };
	}

	// Check for simple questions about the assistant's function
	if (simpleQuestions.some((q) => lowerMessage.includes(q))) {
		const response =
			"I'm an AI assistant designed to help you extract and organize transaction data from text or descriptions. Just paste your data or tell me about your spending!";
		// Return the response string for the service layer to add.
		return { handled: true, response: response };
	}

	// If none of the simple cases match, it's not handled by this handler.
	return { handled: false };
}
