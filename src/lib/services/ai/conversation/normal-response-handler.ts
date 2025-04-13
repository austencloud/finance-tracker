// src/lib/services/ai/conversation/normal-response-handler.ts
import { get } from 'svelte/store';
import { ollamaChat } from '../llm-client';
import { getSystemPrompt } from '../prompts';
import { conversationMessages, getState } from '../conversation';

/**
 * Gets a response from the LLM for normal conversation
 */
export async function getNormalResponse(message: string): Promise<string> {
	console.log('[sendUserMessage] Processing as normal conversation.');

	const today = new Date().toISOString().split('T')[0];
	const systemPromptContent = getSystemPrompt(today);
	const currentMessages = get(conversationMessages);

	const apiMessages = [{ role: 'system', content: systemPromptContent }, ...currentMessages];

	const response = await ollamaChat(apiMessages);

	// Handle empty or repetitive initial responses
	const { initialPromptSent } = getState();
	if (!initialPromptSent) {
		const lowerResp = response.toLowerCase().trim();
		if (!response || lowerResp.startsWith("hello! i'm your ai transaction assistant.")) {
			return `I see you mentioned "${message}". Could you provide more details?`;
		}
	}

	return response;
}
