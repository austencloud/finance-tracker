// src/lib/services/ai/deepseek-client.ts
import { get } from 'svelte/store';
import { conversationStatus } from './store';

// DeepSeek API configuration
// DeepSeek API configuration
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1';
// Try adding the "sk-" prefix if it's not already there
const DEEPSEEK_API_KEY = (import.meta.env.VITE_DEEPSEEK_API_KEY || '').startsWith('sk-')
	? import.meta.env.VITE_DEEPSEEK_API_KEY
	: `sk-${import.meta.env.VITE_DEEPSEEK_API_KEY}`;
const CHAT_MODEL = 'deepseek-chat'; // Check if this is the correct model name

// Track when the last API call was made to avoid rate limiting
let lastApiCallTime = 0;
const MIN_API_CALL_INTERVAL = 500; // ms

/**
 * Ensures we don't make API calls too frequently
 */
async function throttleApiCall(): Promise<void> {
	const now = Date.now();
	const timeElapsed = now - lastApiCallTime;

	if (timeElapsed < MIN_API_CALL_INTERVAL) {
		const waitTime = MIN_API_CALL_INTERVAL - timeElapsed;
		await new Promise((resolve) => setTimeout(resolve, waitTime));
	}

	lastApiCallTime = Date.now();
}

/**
 * Handles errors from the DeepSeek API
 */
function handleApiError(error: any, context: string): Error {
	conversationStatus.set('Error');

	// Log detailed error information
	console.error(`[${context}] API Error:`, error);

	if (error instanceof Error) {
		return new Error(`${context} error: ${error.message}`);
	}

	return new Error(`${context} error: Unknown error occurred`);
}

/**
 * Sends messages to the DeepSeek Chat API with improved error handling
 */
export async function deepseekChat(messages: { role: string; content: string }[]): Promise<string> {
	console.log(`[deepseekChat] Sending ${messages.length} messages to DeepSeek...`);
	const url = `${DEEPSEEK_API_URL}/chat/completions`;

	try {
		// Make sure we don't hit rate limits
		await throttleApiCall();

		// Update status
		conversationStatus.set('Connecting to AI...');

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${DEEPSEEK_API_KEY}`
			},
			body: JSON.stringify({
				model: CHAT_MODEL,
				messages: messages,
				temperature: 0.7,
				max_tokens: 2048
			})
		});

		// Handle HTTP errors
		if (!response.ok) {
			const errorBody = await response.text();
			console.error(`[deepseekChat] API Error (${response.status}):`, errorBody);

			// Handle different error types
			if (response.status === 401 || response.status === 403) {
				throw new Error('Authentication failed. Please check your API key.');
			} else if (response.status === 429) {
				throw new Error('Rate limit exceeded. Please try again shortly.');
			} else if (response.status >= 500) {
				throw new Error('The AI service is experiencing issues. Please try again later.');
			} else {
				throw new Error(`DeepSeek API error: ${response.status}`);
			}
		}

		const data = await response.json();

		// Reset error status if successful
		if (get(conversationStatus) === 'Error') {
			conversationStatus.set('');
		}

		if (data.choices && data.choices.length > 0 && data.choices[0].message) {
			console.log('[deepseekChat] Received successful response');
			return data.choices[0].message.content;
		} else {
			console.error('[deepseekChat] Unexpected response structure:', data);
			throw new Error('Unexpected DeepSeek response structure');
		}
	} catch (error) {
		throw handleApiError(error, 'deepseekChat');
	}
}

/**
 * Sends a prompt to DeepSeek, expecting JSON output, with improved error handling
 */
export async function deepseekGenerateJson(prompt: string, systemPrompt?: string): Promise<string> {
	console.log(`[deepseekGenerateJson] Sending prompt to DeepSeek...`);

	const messages = [
		...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
		{ role: 'user', content: prompt }
	];

	try {
		// Make sure we don't hit rate limits
		await throttleApiCall();

		// Update status
		conversationStatus.set('Processing data...');

		const response = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${DEEPSEEK_API_KEY}`
			},
			body: JSON.stringify({
				model: CHAT_MODEL,
				messages: messages,
				temperature: 0.3,
				response_format: { type: 'json_object' },
				max_tokens: 4096
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[deepseekGenerateJson] API Error (${response.status}):`, errorText);

			// Handle different error types
			if (response.status === 401 || response.status === 403) {
				throw new Error('Authentication failed. Please check your API key.');
			} else if (response.status === 429) {
				throw new Error('Rate limit exceeded. Please try again shortly.');
			} else if (response.status >= 500) {
				throw new Error('The AI service is experiencing issues. Please try again later.');
			} else {
				throw new Error(`DeepSeek API error: ${response.status}`);
			}
		}

		const data = await response.json();

		// Reset error status if successful
		if (get(conversationStatus) === 'Error') {
			conversationStatus.set('');
		}

		if (data.choices && data.choices.length > 0 && data.choices[0].message) {
			console.log('[deepseekGenerateJson] Received successful JSON response');
			return data.choices[0].message.content;
		} else {
			console.error('[deepseekGenerateJson] Unexpected response structure:', data);
			throw new Error('Unexpected DeepSeek response structure');
		}
	} catch (error) {
		throw handleApiError(error, 'deepseekGenerateJson');
	}
}

/**
 * Check if the DeepSeek API is available with improved error handling
 */
export async function isLLMAvailable(): Promise<boolean> {
	try {
		// Make a minimal test request
		await throttleApiCall();

		const response = await fetch(`${DEEPSEEK_API_URL}/models`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${DEEPSEEK_API_KEY}`
			}
		});

		// If we get any response, consider the API available
		return response.ok;
	} catch (error) {
		console.error('[isLLMAvailable] Error checking DeepSeek availability:', error);
		return false;
	}
}

/**
 * Provides a fallback response when the API is unavailable
 */
export function getFallbackResponse(): string {
	return "I'm currently having trouble connecting to my AI services. Please try again in a moment. If you were trying to record a transaction, make sure to include specific details like the amount, date, and what it was for.";
}
