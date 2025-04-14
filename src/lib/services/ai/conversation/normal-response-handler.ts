// src/lib/services/ai/conversation/normal-response-handler.ts
import { get } from 'svelte/store';
import { deepseekChat } from '../deepseek-client';
import { getSystemPrompt } from '../prompts';
import { conversationMessages, getState, extractedTransactions } from '../store';

// Common patterns for non-transaction queries that should still be answered
const MODEL_QUESTION_REGEX =
	/\b(what|which|who|how)(?:\s+are|\s+is|\s+model|\s+llm|\s+version|\s+created|\s+made|\s+designed)\b/i;
const CAPABILITY_QUESTION_REGEX = /\b(what|how)(?:\s+can|\s+could|\s+do|\s+able|\s+capable)\b/i;
const PERSONAL_QUESTION_REGEX = /\b(who|what|where|how|are)\s+you\b/i;
const HELP_QUESTION_REGEX = /\b(help|assist|guide|explain|tell\s+me\s+about)\b/i;

/**
 * Checks if the message is likely a question about the AI or system capabilities
 * rather than a transaction-related query
 */
function isMetaQuestion(message: string): boolean {
	return (
		MODEL_QUESTION_REGEX.test(message) ||
		CAPABILITY_QUESTION_REGEX.test(message) ||
		PERSONAL_QUESTION_REGEX.test(message) ||
		HELP_QUESTION_REGEX.test(message)
	);
}

/**
 * Gets a response from the LLM for normal conversation
 * Enhanced to handle non-transaction questions better
 */
export async function getNormalResponse(message: string): Promise<string> {
	console.log('[sendUserMessage] Processing as normal conversation.');

	const today = new Date().toISOString().split('T')[0];
	const systemPromptContent = getSystemPrompt(today);
	const currentMessages = get(conversationMessages);
	const hasTransactions = get(extractedTransactions).length > 0;

	// For meta-questions about the system, add a hint to the system prompt
	let adjustedSystemPrompt = systemPromptContent;
	if (isMetaQuestion(message)) {
		adjustedSystemPrompt += `\n\nThe user is asking a question about you or your capabilities. Answer their question directly and helpfully. If you've already recorded transactions, remind them about this at the end of your response.`;
	}

	const apiMessages = [{ role: 'system', content: adjustedSystemPrompt }, ...currentMessages];

	// Try to get a response with retries
	let retries = 2;
	let response = '';
	let error = null;

	while (retries >= 0 && !response) {
		try {
			response = await deepseekChat(apiMessages);
			break;
		} catch (err) {
			error = err;
			retries--;
			console.log(`[getNormalResponse] Error, retries left: ${retries}`, err);
			// Wait before retrying
			if (retries >= 0) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	}

	// If we still have no response after retries, create a fallback
	if (!response && error) {
		console.error('[getNormalResponse] Failed after retries:', error);

		// Create a meaningful fallback response
		if (isMetaQuestion(message)) {
			response =
				"I'm your AI Transaction Assistant, designed to help you organize your financial data. I seem to be having some connection issues at the moment. Could you try again shortly?";
		} else {
			response =
				"I'm having trouble processing that right now. Could you try rephrasing or checking back in a moment? If you're describing transactions, try being very specific with amounts, dates, and what each transaction was for.";
		}

		// Add transaction context if we have some
		if (hasTransactions) {
			response += ` By the way, I've already recorded ${get(extractedTransactions).length} transaction(s) in this session.`;
		}
	}

	// Handle empty or repetitive initial responses
	const { initialPromptSent } = getState();
	if (!initialPromptSent) {
		const lowerResp = response.toLowerCase().trim();
		if (!response || lowerResp.startsWith("hello! i'm your ai transaction assistant.")) {
			return `I'm not sure I fully understood "${message}". Could you provide more details? I'm looking for transaction information like "I spent $20 on groceries yesterday" or "I received $500 from my client on Monday."`;
		}
	}

	return response;
}
