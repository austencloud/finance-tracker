// src/lib/services/ai/deepseek-client.ts
import { get } from 'svelte/store';
import { writable } from 'svelte/store'; // Use a local writable for status if needed
import { AI_CONFIG } from '$lib/config/ai-config'; // Assuming config file exists

// --- Local Store for API Status ---
// This avoids polluting the global conversation status directly from the client
const apiStatus = writable<'idle' | 'connecting' | 'processing' | 'error'>('idle');
export const deepseekApiStatus = apiStatus; // Export read-only derived if preferred

// API configuration (adjust model names as needed)
const CHAT_MODEL = 'deepseek-chat';
// const REASONER_MODEL = 'deepseek-reasoner'; // Use if needed for specific tasks

// Rate limiting
let lastApiCallTime = 0;
const MIN_API_CALL_INTERVAL = 500; // ms

// Custom Error for API issues
export class DeepSeekApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public context?: string,
		public details?: unknown
	) {
		super(message);
		this.name = 'DeepSeekApiError';
	}
}

async function throttleApiCall(): Promise<void> {
	const now = Date.now();
	const timeElapsed = now - lastApiCallTime;
	if (timeElapsed < MIN_API_CALL_INTERVAL) {
		const waitTime = MIN_API_CALL_INTERVAL - timeElapsed;
		await new Promise((resolve) => setTimeout(resolve, waitTime));
	}
	lastApiCallTime = Date.now();
}

async function fetchWithTimeout(
	resource: RequestInfo | URL,
	options: RequestInit & { timeout?: number } = {}
) {
	const { timeout = 15000 } = options; // Default 15s timeout

	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(resource, {
			...options,
			signal: controller.signal
		});
		clearTimeout(id);
		return response;
	} catch (error) {
		clearTimeout(id);
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new DeepSeekApiError('API request timed out', 408, 'fetchWithTimeout');
		}
		throw error; // Re-throw other errors
	}
}

/**
 * Sends messages to the DeepSeek Chat API.
 * Throws DeepSeekApiError on failure.
 */
export async function deepseekChat(
	messages: { role: string; content: string }[],
	options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
	console.log(`[deepseekChat] Sending ${messages.length} messages to DeepSeek...`);
	const url = `${AI_CONFIG.apiUrl}${AI_CONFIG.chatEndpoint}`;
	const { temperature = 0.7, max_tokens = 2048 } = options;

	await throttleApiCall();
	apiStatus.set('connecting');

	try {
		const response = await fetchWithTimeout(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${AI_CONFIG.apiKey}`
			},
			body: JSON.stringify({
				model: CHAT_MODEL,
				messages: messages,
				temperature: temperature,
				max_tokens: max_tokens
			}),
			timeout: 30000 // Longer timeout for chat
		});

		if (!response.ok) {
			let errorBody: any = null;
			try {
				errorBody = await response.json(); // Try parsing JSON error
			} catch {
				errorBody = await response.text(); // Fallback to text
			}
			console.error(`[deepseekChat] API Error (${response.status}):`, errorBody);
			throw new DeepSeekApiError(
				`API Error: ${errorBody?.error?.message || response.statusText || 'Unknown error'}`,
				response.status,
				'deepseekChat',
				errorBody
			);
		}

		const data = await response.json();
		apiStatus.set('idle');

		if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
			console.log('[deepseekChat] Received successful response');
			return data.choices[0].message.content;
		} else {
			console.error('[deepseekChat] Unexpected response structure:', data);
			throw new DeepSeekApiError('Unexpected response structure', undefined, 'deepseekChat', data);
		}
	} catch (error) {
		apiStatus.set('error');
		if (error instanceof DeepSeekApiError) {
			throw error; // Re-throw specific API error
		}
		console.error('[deepseekChat] Network or other error:', error);
		throw new DeepSeekApiError(
			error instanceof Error ? error.message : 'Network or client error',
			undefined, // status code unknown
			'deepseekChat',
			error
		);
	}
}

/**
 * Sends a prompt to DeepSeek expecting JSON output using JSON mode.
 * Throws DeepSeekApiError on failure.
 */
export async function deepseekGenerateJson(
	prompt: string,
	systemPrompt?: string,
	options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
	console.log(`[deepseekGenerateJson] Sending prompt for JSON output...`);
	const url = `${AI_CONFIG.apiUrl}${AI_CONFIG.chatEndpoint}`;
	const { temperature = 0.3, max_tokens = 4096 } = options; // Max tokens higher for JSON

	// Construct messages, ensuring JSON is requested
	const messages = [
		...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
		{
			role: 'user',
			content: `${prompt}\n\nCRITICAL INSTRUCTION: Your response MUST BEGIN IMMEDIATELY with the opening brace '{' of the JSON object. DO NOT include ANY explanatory text, thinking, preamble, or markdown code blocks. Just the raw JSON. If you add ANY text before the JSON object, it will cause parsing errors.`
		} // Explicit instruction
	];

	await throttleApiCall();
	apiStatus.set('processing');

	try {
		const response = await fetchWithTimeout(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${AI_CONFIG.apiKey}`
			},
			body: JSON.stringify({
				model: CHAT_MODEL, // Or potentially REASONER_MODEL if needed
				messages: messages,
				temperature: temperature,
				response_format: { type: 'json_object' }, // <-- USE JSON MODE
				max_tokens: max_tokens
			}),
			timeout: 45000 // Longer timeout for potentially complex JSON generation
		});

		if (!response.ok) {
			let errorBody: any = null;
			try {
				errorBody = await response.json();
			} catch {
				errorBody = await response.text();
			}
			console.error(`[deepseekGenerateJson] API Error (${response.status}):`, errorBody);
			throw new DeepSeekApiError(
				`API Error: ${errorBody?.error?.message || response.statusText || 'Unknown error'}`,
				response.status,
				'deepseekGenerateJson',
				errorBody
			);
		}

		const data = await response.json();
		apiStatus.set('idle');

		if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
			console.log('[deepseekGenerateJson] Received successful JSON response (syntax guaranteed)');
			// Return the raw string content, parsing/validation happens elsewhere
			return data.choices[0].message.content;
		} else {
			console.error('[deepseekGenerateJson] Unexpected response structure:', data);
			throw new DeepSeekApiError(
				'Unexpected response structure',
				undefined,
				'deepseekGenerateJson',
				data
			);
		}
	} catch (error) {
		apiStatus.set('error');
		if (error instanceof DeepSeekApiError) {
			throw error; // Re-throw specific API error
		}
		console.error('[deepseekGenerateJson] Network or other error:', error);
		throw new DeepSeekApiError(
			error instanceof Error ? error.message : 'Network or client error',
			undefined,
			'deepseekGenerateJson',
			error
		);
	}
}

/**
 * Check if the DeepSeek API is available (basic check).
 */
export async function isLLMAvailable(): Promise<boolean> {
	if (!AI_CONFIG.apiKey || AI_CONFIG.apiKey === 'sk-') {
		console.warn('DeepSeek API Key not configured.');
		return false;
	}
	try {
		await throttleApiCall();
		const response = await fetchWithTimeout(`${AI_CONFIG.apiUrl}/models`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${AI_CONFIG.apiKey}`
			},
			timeout: 5000 // Shorter timeout for availability check
		});
		return response.ok;
	} catch (error) {
		console.error(
			'[isLLMAvailable] Error checking DeepSeek availability:',
			error instanceof Error ? error.message : error
		);
		return false;
	}
}

/**
 * Provides a generic fallback response for API issues.
 */
export function getFallbackResponse(error?: unknown): string {
	let baseMessage =
		"I'm currently having trouble connecting to my AI services. Please try again in a moment.";
	if (error instanceof DeepSeekApiError) {
		baseMessage = `Sorry, I encountered an issue (${error.status || 'network'}): ${error.message}`;
	} else if (error instanceof Error) {
		baseMessage = `Sorry, an unexpected error occurred: ${error.message}`;
	}
	return `${baseMessage} If you were trying to record a transaction, please ensure you include specific details like the amount, date, and description.`;
}
