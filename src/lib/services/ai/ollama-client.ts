// src/lib/services/ai/ollama-client.ts

import { OLLAMA_CONFIG } from '$lib/config/ai-config';

const STANDARD_MODEL = 'llama3:latest'; // fast 8‑B model
const HEAVY_MODEL = 'deepseek-r1:8b'; // bigger, deeper reasoning

// Track active model (initialized from config)
let activeModel = OLLAMA_CONFIG.model;

/**
 * Sets the active Ollama model to use for future requests
 */
export function setOllamaModel(modelName: string): void {
	const next = (modelName ?? '').trim();
	if (!next) return;                         // safeguard
	if (next === activeModel) return;          // <─ early‑exit (key change)
  
	console.log(`[setOllamaModel] Changing active model from ${activeModel} to ${next}`);
	activeModel = next;
  }

/**
 * Gets the currently active Ollama model name
 */
export function getActiveOllamaModel(): string {
	return activeModel;
}

// Custom Error for Ollama API issues
export class OllamaApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public context?: string,
		public details?: unknown
	) {
		super(message);
		this.name = 'OllamaApiError';
	}
}

// Helper for fetch with timeout
async function fetchWithTimeout(
	resource: RequestInfo | URL,
	options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
	const { timeout = 30000 } = options;

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
				undefined,
				'fetchWithTimeout',
				error
			);
		}
		throw error;
	}
}

/**
 * Lists all available models from Ollama
 * @returns Array of model names
 */
export async function listOllamaModels(): Promise<string[]> {
	// FIX: Change from /tags to the correct Ollama API endpoint
	const url = `${OLLAMA_CONFIG.apiUrl}/tags`;

	try {
		const response = await fetchWithTimeout(url, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' },
			timeout: 5000
		});

		if (!response.ok) {
			console.warn(`[listOllamaModels] Failed to list models: ${response.statusText}`);
			return [];
		}

		const data = await response.json();

		// Extract model names from the response
		if (data && Array.isArray(data.models)) {
			return data.models.map((model: any) => model.name);
		}

		return [];
	} catch (error) {
		console.error('[listOllamaModels] Error:', error);
		return [];
	}
}
/**
 * Checks if Ollama is running and the current model is available.
 * More reliable check that handles API changes in recent Ollama versions.
 */ // ollama-client.ts
// ollama‑client.ts
export async function isOllamaAvailable(opts: { timeout?: number } = {}): Promise<boolean> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), opts.timeout ?? 2000);

	try {
		// apiUrl already ends with /api
		const res = await fetch(`${OLLAMA_CONFIG.apiUrl}/tags`, {
			method: 'GET',
			signal: ctl.signal
		});
		return res.ok; // 200 → up
	} catch {
		return false; // network / timeout / non‑200
	} finally {
		clearTimeout(timer);
	}
}
function pickModel(prompt: string, opts?: { forceHeavy?: boolean }): string {
	const tokenEstimate = Math.ceil(prompt.length / 4);
	if (opts?.forceHeavy || tokenEstimate > 300) return HEAVY_MODEL;
	return STANDARD_MODEL;
}
/**
 * Sends messages to the Ollama Chat API endpoint.
 * @param messages - Array of messages for the chat context.
 * @param options - Optional parameters like temperature.
 * @param requestJsonFormat - Whether to explicitly ask for JSON format.
 * @returns The complete assistant message content as a string.
 */
export async function ollamaChat(
	messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
	options: { temperature?: number } = {},
	requestJsonFormat: boolean = false
): Promise<string> {
	console.log(
		`[ollamaChat] Sending ${messages.length} messages to Ollama model: ${activeModel}...`
	);
	const url = `${OLLAMA_CONFIG.apiUrl}${OLLAMA_CONFIG.chatEndpoint}`;
	const { temperature = 0.7 } = options;

	// Check if model exists before attempting to use it
	try {
		// Pull the model if it doesn't exist
		const modelCheckUrl = `${OLLAMA_CONFIG.apiUrl}/show`;

		// This is a pre-flight check
		const modelCheckResponse = await fetchWithTimeout(modelCheckUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: activeModel }),
			timeout: 5000
		});

		if (!modelCheckResponse.ok) {
			console.warn(
				`[ollamaChat] Model ${activeModel} might not be available. Attempting to use anyway.`
			);
			// We don't throw here, as we'll try the chat request anyway
		}
	} catch (error) {
		console.warn(
			`[ollamaChat] Error checking model availability: ${error}. Will try to proceed anyway.`
		);
		// Continue anyway - it might work
	}

	const requestBody: any = {
		model: activeModel,
		messages: messages,
		stream: false,
		temperature: temperature
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
			timeout: 60000
		});

		if (!response.ok) {
			let errorBodyText = await response.text();
			let errorDetails: any = null;
			try {
				errorDetails = JSON.parse(errorBodyText);
			} catch {
				/* Ignore parsing error */
			}

			console.error(`[ollamaChat] Ollama API Error (${response.status}):`, errorBodyText);

			// Check if the error is about the model not being found
			if (errorDetails?.error?.includes('not found, try pulling it first')) {
				throw new OllamaApiError(
					`The model ${activeModel} is not installed. Please install it with: ollama pull ${activeModel}`,
					response.status,
					'ollamaChat',
					errorDetails || errorBodyText
				);
			}

			throw new OllamaApiError(
				`Ollama API Error: ${errorDetails?.error || response.statusText || 'Unknown error'}`,
				response.status,
				'ollamaChat',
				errorDetails || errorBodyText
			);
		}

		const data = await response.json();

		// Handle Ollama's response structure
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
			throw error;
		}
		console.error('[ollamaChat] Network or other error:', error);
		throw new OllamaApiError(
			error instanceof Error ? error.message : 'Network or client error communicating with Ollama',
			undefined,
			'ollamaChat',
			error
		);
	}
}

/**
 * Provides a generic fallback response for Ollama issues.
 */
export function getOllamaFallbackResponse(error?: unknown): string {
	let baseMessage =
		"I'm currently having trouble connecting to the local Ollama AI service. Please ensure Ollama is running and the configured model is available.";

	if (error instanceof OllamaApiError) {
		if (
			error.message.includes('not installed') ||
			error.message.includes('not found, try pulling')
		) {
			return `The model '${activeModel}' is not installed. Please run 'ollama pull ${activeModel}' to install it.`;
		}
		baseMessage = `Sorry, I encountered an issue connecting to Ollama: ${error.message}`;
	} else if (error instanceof Error) {
		baseMessage = `Sorry, an unexpected error occurred while using Ollama: ${error.message}`;
	}

	return baseMessage;
}
