// src/lib/services/ai/ollama-client.ts

import { OLLAMA_CONFIG } from '$lib/config/ai-config';

// Custom Error for Ollama API issues
export class OllamaApiError extends Error {
	constructor(
		message: string,
		public status?: number, // HTTP status if applicable
		public context?: string,
		public details?: unknown
	) {
		super(message);
		this.name = 'OllamaApiError';
	}
}

// Helper for fetch with timeout (similar to deepseek-client)
async function fetchWithTimeout(
	resource: RequestInfo | URL,
	options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
	const { timeout = 30000 } = options; // Default 30s timeout for local models

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
			throw new OllamaApiError('Ollama request timed out', 408, 'fetchWithTimeout');
		}
		// Handle potential connection refused errors more gracefully
		if (error instanceof TypeError && error.message.includes('fetch failed')) {
			throw new OllamaApiError(
				'Connection to Ollama failed. Is Ollama running?',
				undefined, // No HTTP status
				'fetchWithTimeout',
				error
			);
		}
		throw error; // Re-throw other errors
	}
}

/**
 * Sends messages to the Ollama Chat API endpoint.
 * Handles streaming responses and reconstructs the full message.
 * Throws OllamaApiError on failure.
 * @param messages - Array of messages for the chat context.
 * @param options - Optional parameters like temperature.
 * @param requestJsonFormat - Whether to explicitly ask for JSON format in the request.
 * @returns The complete assistant message content as a string.
 */
export async function ollamaChat(
	messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
	options: { temperature?: number } = {},
	requestJsonFormat: boolean = false // Flag to request JSON format
): Promise<string> {
	console.log(
		`[ollamaChat] Sending ${messages.length} messages to Ollama model: ${OLLAMA_CONFIG.model}...`
	);
	const url = `${OLLAMA_CONFIG.apiUrl}${OLLAMA_CONFIG.chatEndpoint}`;
	const { temperature = 0.7 } = options;

	const requestBody: any = {
		model: OLLAMA_CONFIG.model,
		messages: messages,
		stream: false, // Set stream to false to get complete response at once
		temperature: temperature
		// Ollama uses keep_alive: -1 for indefinite context by default
	};

	// Add format parameter if JSON is requested
	if (requestJsonFormat) {
		requestBody.format = 'json';
		console.log(`[ollamaChat] Requesting JSON format from Ollama.`);
	}

	try {
		const response = await fetchWithTimeout(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody),
			timeout: 60000 // Increase timeout for potentially slower local models
		});

		if (!response.ok) {
			let errorBodyText = await response.text(); // Read error as text first
			let errorDetails: any = null;
			try {
				errorDetails = JSON.parse(errorBodyText); // Try parsing if it's JSON
			} catch {
				/* Ignore parsing error */
			}

			console.error(`[ollamaChat] Ollama API Error (${response.status}):`, errorBodyText);
			throw new OllamaApiError(
				`Ollama API Error: ${errorDetails?.error || response.statusText || 'Unknown error'}`,
				response.status,
				'ollamaChat',
				errorDetails || errorBodyText // Provide parsed details or raw text
			);
		}

		const data = await response.json();

		// Handle Ollama's non-streaming response structure
		if (data && data.message && typeof data.message.content === 'string') {
			console.log('[ollamaChat] Received successful response from Ollama.');
			return data.message.content;
		} else {
			console.error('[ollamaChat] Unexpected response structure from Ollama:', data);
			throw new OllamaApiError(
				'Unexpected response structure from Ollama',
				undefined,
				'ollamaChat',
				data
			);
		}
	} catch (error) {
		if (error instanceof OllamaApiError) {
			throw error; // Re-throw specific API error
		}
		console.error('[ollamaChat] Network or other error:', error);
		throw new OllamaApiError(
			error instanceof Error ? error.message : 'Network or client error communicating with Ollama',
			undefined, // status code unknown
			'ollamaChat',
			error
		);
	}
}

/**
 * Checks if the configured Ollama model is available.
 * Sends a simple request to the /api/show endpoint.
 */
export async function isOllamaAvailable(): Promise<boolean> {
	if (!OLLAMA_CONFIG.model) return false;
	const url = `${OLLAMA_CONFIG.apiUrl}/show`;
	try {
		const response = await fetchWithTimeout(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: OLLAMA_CONFIG.model }),
			timeout: 5000 // Shorter timeout for availability check
		});
		return response.ok;
	} catch (error) {
		console.error(
			'[isOllamaAvailable] Error checking Ollama availability:',
			error instanceof Error ? error.message : error
		);
		return false;
	}
}

/**
 * Provides a generic fallback response for Ollama issues.
 */
export function getOllamaFallbackResponse(error?: unknown): string {
	let baseMessage =
		"I'm currently having trouble connecting to the local Ollama AI service. Please ensure Ollama is running and the configured model is available.";
	if (error instanceof OllamaApiError) {
		baseMessage = `Sorry, I encountered an issue connecting to Ollama (${error.status || 'network'}): ${error.message}`;
	} else if (error instanceof Error) {
		baseMessage = `Sorry, an unexpected error occurred while using Ollama: ${error.message}`;
	}
	return `${baseMessage}`;
}
