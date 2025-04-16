// src/lib/services/ai/llm.ts

import { AI_BACKEND_TO_USE, OLLAMA_CONFIG } from '$lib/config/ai-config';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/AppStore';

// Import functions from BOTH clients, renaming for clarity
// Fix the import to match what's actually exported from deepseek-client
import {
	llmChat as deepseekChat, // Fixed: using what's actually exported
	deepseekGenerateJson,
	isLLMAvailable as isDeepSeekAvailable,
	getDeepSeekFallback,
	DeepSeekApiError
} from './deepseek-client';

import {
	ollamaChat,
	isOllamaAvailable,
	getOllamaFallbackResponse,
	OllamaApiError,
	setOllamaModel // Add this function to ollama-client.ts
} from './ollama-client';

// Define common message type expected by both clients
type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };
// src/lib/services/ai/llm.ts - Add this improved check function

/**
 * Tests if the LLM is actually available by sending a simple test request
 * This is more reliable than just checking if the service is running
 */
export async function testLLMWithSimpleRequest(): Promise<boolean> {
	const { backend, modelId } = getCurrentBackend();
	console.log(`[testLLMWithSimpleRequest] Testing ${backend} model: ${modelId}`);

	try {
		// Create a very simple test message
		const testMessages: ChatMessage[] = [
			{ role: 'user', content: 'Reply with the word "working" if you can see this message.' }
		];

		// Set a short timeout to avoid long waits
		const options = {
			temperature: 0.1,
			timeout: 5000 // 5 seconds max
		};

		// Try to get a response
		if (backend === 'ollama') {
			// For Ollama, first check if service is running
			const isRunning = await isOllamaAvailable();
			if (!isRunning) {
				console.log('[testLLMWithSimpleRequest] Ollama service not running');
				return false;
			}

			// Then try a quick chat request with timeout
			try {
				const response = await ollamaChat(testMessages, options, false);
				const isWorking =
					typeof response === 'string' &&
					(response.toLowerCase().includes('working') ||
						response.toLowerCase().includes('see this message'));

				console.log(
					`[testLLMWithSimpleRequest] Ollama test ${isWorking ? 'succeeded' : 'failed'} with response: ${typeof response === 'string' ? response.substring(0, 50) : ''}...`
				);
				return isWorking;
			} catch (e) {
				console.log('[testLLMWithSimpleRequest] Ollama test chat failed:', e);
				return false;
			}
		} else {
			// For DeepSeek, similar approach
			const isAvailable = await isDeepSeekAvailable();
			if (!isAvailable) return false;

			try {
				const response = await deepseekChat(testMessages, options);
				return typeof response === 'string' && response.length > 0;
			} catch (e) {
				return false;
			}
		}
	} catch (error) {
		console.error('[testLLMWithSimpleRequest] Error testing LLM:', error);
		return false;
	}
}

// Update the isLLMAvailable function to use this more reliable test
export async function isLLMAvailable(): Promise<boolean> {
	try {
		return await testLLMWithSimpleRequest();
	} catch (e) {
		console.error('[isLLMAvailable] Error:', e);
		return false;
	}
}
/**
 * Gets the current backend to use based on the AppStore selection
 * Falls back to config file if store unavailable
 */
function getCurrentBackend(): { backend: 'ollama' | 'deepseek'; modelId: string } {
	try {
		const state = get(appStore);
		if (state && state.ui) {
			const selectedModelId = state.ui.selectedModel;
			const selectedModel = state.ui.availableModels.find((m) => m.id === selectedModelId);

			if (selectedModel) {
				return {
					backend: selectedModel.backend,
					modelId: selectedModel.id
				};
			}
		}
	} catch (e) {
		console.warn('Error getting current model from store, using config:', e);
	}

	// Fallback to config
	return {
		backend: AI_BACKEND_TO_USE as 'ollama' | 'deepseek',
		modelId: AI_BACKEND_TO_USE === 'ollama' ? OLLAMA_CONFIG.model : 'deepseek-chat'
	};
}

/**
 * Sends messages to the configured chat API endpoint.
 * @param messages - Array of messages for the chat context.
 * @param options - Optional parameters like temperature.
 * @param forceBackend - Optional override for backend selection.
 * @returns The complete assistant message content as a string.
 * @throws {DeepSeekApiError | OllamaApiError | Error} - Throws specific errors on failure.
 */
export async function llmChat(
	messages: ChatMessage[],
	options: { temperature?: number } = {},
	forceBackend?: 'ollama' | 'deepseek'
): Promise<string> {
	const { backend, modelId } = forceBackend
		? {
				backend: forceBackend,
				modelId: forceBackend === 'ollama' ? OLLAMA_CONFIG.model : 'deepseek-chat'
			}
		: getCurrentBackend();

	console.log(`[llmChat] Using ${backend} backend with model: ${modelId}`);

	if (backend === 'ollama') {
		// Set the active model
		if (modelId !== OLLAMA_CONFIG.model) {
			setOllamaModel(modelId);
		}

		// Ollama client handles standard chat without special format request
		return ollamaChat(messages, options, false);
	} else {
		// DeepSeek client handles standard chat
		return deepseekChat(messages, options);
	}
}

/**
 * Sends a prompt to the configured AI expecting a JSON response.
 * @param prompt - The main user prompt.
 * @param systemPrompt - Optional system prompt.
 * @param options - Optional parameters like temperature.
 * @param forceBackend - Optional override for backend selection.
 * @returns The raw JSON string response from the LLM.
 * @throws {DeepSeekApiError | OllamaApiError | Error} - Throws specific errors on failure.
 */
export async function llmGenerateJson(
	prompt: string,
	systemPrompt?: string,
	options: { temperature?: number; max_tokens?: number } = {},
	forceBackend?: 'ollama' | 'deepseek'
): Promise<string> {
	const { backend, modelId } = forceBackend
		? {
				backend: forceBackend,
				modelId: forceBackend === 'ollama' ? OLLAMA_CONFIG.model : 'deepseek-chat'
			}
		: getCurrentBackend();

	console.log(`[llmGenerateJson] Using ${backend} backend with model: ${modelId}`);

	if (backend === 'ollama') {
		// Set the active model
		if (modelId !== OLLAMA_CONFIG.model) {
			setOllamaModel(modelId);
		}

		// Construct messages array for Ollama chat endpoint and request JSON format
		const messages: ChatMessage[] = [
			...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
			{ role: 'user' as const, content: prompt }
		];
		// Ollama client needs explicit request for JSON format
		return ollamaChat(messages, options, true);
	} else {
		// DeepSeek client has a dedicated function that handles JSON mode
		return deepseekGenerateJson(prompt, systemPrompt, options);
	}
}

/**
 * Choose a backend based on task characteristics
 * - Use local for small/simple tasks
 * - Use cloud for complex reasoning
 */
export async function chooseBackendForTask(task: {
	type: 'chat' | 'json' | 'extraction' | 'analysis';
	complexity: 'low' | 'medium' | 'high';
	inputLength: number;
}): Promise<'ollama' | 'deepseek'> {
	const { backend } = getCurrentBackend();

	// If we're explicitly set to a backend, honor that choice
	if (backend === 'deepseek') {
		return 'deepseek';
	}

	// Strategy: use local model for simple tasks, fallback to cloud for complex ones
	// This logic can be customized based on user preferences and experience

	// Simple chats and short inputs go to local model
	if (task.complexity === 'low' && task.inputLength < 2000) {
		return 'ollama';
	}

	// Medium complexity with reasonable length can still use local
	if (task.complexity === 'medium' && task.inputLength < 1000) {
		return 'ollama';
	}

	// JSON generation often works well locally
	if (task.type === 'json' && task.complexity !== 'high') {
		return 'ollama';
	}

	// For complex analyses and large inputs, prefer cloud
	if (task.complexity === 'high' || task.inputLength > 5000) {
		try {
			// Fix: add await to properly check if DeepSeek is available
			const deepseekPromise = isDeepSeekAvailable();
			const deepseekAvailable = await deepseekPromise;
			if (deepseekAvailable) {
				return 'deepseek';
			}
		} catch (e) {
			console.warn('Error checking DeepSeek availability:', e);
		}
	}

	// Default to the selected backend
	return backend;
}

/**
 * Gets a generic fallback error message based on the configured backend.
 * @param error - The error object caught.
 * @returns A user-friendly fallback string.
 */
export function getLLMFallbackResponse(error?: unknown): string {
	const { backend } = getCurrentBackend();

	if (backend === 'ollama') {
		return getOllamaFallbackResponse(error);
	} else {
		return getDeepSeekFallback(error);
	}
}

// Export specific error types for error handling
export { DeepSeekApiError, OllamaApiError };
