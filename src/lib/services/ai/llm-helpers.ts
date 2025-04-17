// src/lib/services/ai/llm-helpers.ts
/* ────────────────────────────────────────────────────────────────────
	Local-only LLM helper – picks between configured SMALL and LARGE models
    (e.g., llama3:latest vs deepseek-r1:8b) on the fly.
*/

import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid'; // Keep if needed for any future logging/tracing

// --- Import specific stores ---
// import { appStore } from '$lib/stores/AppStore'; // REMOVE old import
import { uiStore } from '$lib/stores/uiStore'; // ADD specific store import

// --- Import Ollama client and config ---
import {
	ollamaChat,
	isOllamaAvailable, // Keep if testLLMWithSimpleRequest is used for availability checks elsewhere
	getOllamaFallbackResponse,
	OllamaApiError,
	setOllamaModel // Function to tell the client which model to use for the *next* call
} from './ollama-client'; // Adjust path if needed

import { OLLAMA_CONFIG, OLLAMA_MODELS } from '$lib/config/ai-config'; // Adjust path
import { logDebug } from '$lib/config/log'; // Adjust path
import { getSystemPrompt } from './prompts'; // Adjust path

/* ------------------------------------------------------------------ */
/* Simple heuristics & helpers                                      */
/* ------------------------------------------------------------------ */

// Determines if text likely represents a simple request (e.g., single transaction)
function isSimpleRequest(text: string): boolean {
	if (!text) return true; // Treat empty as simple
	const lenOK = text.length < 140;
	const singleLine = !text.includes('\n');
	// Check for more than one potential currency amount
	const amountMatches = text.match(/[\$£€¥]\s?-?\d[\d,]*\.?\d*/g) ?? [];
	const oneAmount = amountMatches.length <= 1;
	// Detect if multiple lines look like CSV data
	const csvLike = text.split('\n').some((l) => l.split(',').length > 3);
	const hasCommaList = csvLike && !oneAmount; // CSV-like AND multiple amounts is complex
	return lenOK && singleLine && oneAmount && !hasCommaList;
}

// Removes <think>...</think> tags sometimes included by models
function stripThinkTags(s: string): string {
	if (!s) return '';
	return s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Basic JSON validity check
function isValidJson(str: string): boolean {
	if (!str || !str.trim().startsWith('{') || !str.trim().endsWith('}')) {
		// Quick check for basic structure before trying full parse
		if (!str || !str.trim().startsWith('[') || !str.trim().endsWith(']')) {
			return false;
		}
	}
	try {
		JSON.parse(str);
		return true;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ */
/* Model picker                                                     */
/* ------------------------------------------------------------------ */

/**
 * Selects an appropriate Ollama model based on request complexity or explicit options.
 * @param text - The input text (used for complexity heuristic).
 * @param opts - Options to force a specific model type.
 * @returns The ID string of the selected model.
 */
export function pickModel(
	text = '',
	opts: { forceHeavy?: boolean; forceSimple?: boolean } = {}
): string {
	if (opts.forceSimple) return OLLAMA_MODELS.SMALL;
	if (opts.forceHeavy) return OLLAMA_MODELS.LARGE;
	// Use simple heuristic based on text complexity
	return isSimpleRequest(text) ? OLLAMA_MODELS.SMALL : OLLAMA_MODELS.LARGE;
}

/* ------------------------------------------------------------------ */
/* Core chat & JSON generation wrappers                             */
/* ------------------------------------------------------------------ */

// Type alias for chat messages
type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

/**
 * Sends messages to an Ollama model, automatically picking a model
 * based on complexity heuristics or options. Cleans response.
 * @param messages - Array of message objects for the conversation history.
 * @param opts - Options like temperature, forcing model type, requesting JSON.
 * @returns The cleaned text response from the LLM.
 */
export async function llmChat(
	messages: ChatMessage[],
	opts: {
		temperature?: number;
		forceHeavy?: boolean;
		forceSimple?: boolean;
		requestJsonFormat?: boolean;
		rawUserText?: string; // Text used for model picking heuristic if different from last message
	} = {}
): Promise<string> {
	// Determine which model to use
	const sampleText =
		opts.rawUserText ?? [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
	const modelId = pickModel(sampleText, opts);
	setOllamaModel(modelId); // Set model for the upcoming client call

	// Call the underlying Ollama client
	const rawResponse = await ollamaChat(
		messages,
		{ temperature: opts.temperature ?? 0.7 }, // Default temperature if not provided
		opts.requestJsonFormat ?? false // Request JSON format if specified
	);

	// Clean and return the response
	const cleanedResponse = stripThinkTags(rawResponse ?? ''); // Handle null/undefined response
	return cleanedResponse;
}

/**
 * Attempts to generate valid JSON using a two-pass strategy:
 * 1. Try the 'simple' model first and verify its output is valid JSON.
 * 2. If the first pass fails or produces invalid JSON, fallback to the 'large' model.
 * @param messages - Conversation history (system prompt will be added).
 * @param opts - Options like temperature, forcing model type.
 * @returns A string containing the JSON output (or throws error on failure).
 */
export async function llmGenerateJson(
	messages: ChatMessage[],
	opts: {
		temperature?: number;
		forceHeavy?: boolean;
		forceSimple?: boolean;
		rawUserText?: string;
	} = {}
): Promise<string> {
	const today = new Date().toISOString().split('T')[0];
	const systemPrompt = getSystemPrompt(today);
	// Prepend system prompt to messages
	const fullMessages = [makeSystemMsg(systemPrompt), ...messages];

	// Determine sample text for model picking heuristic
	const sampleText =
		opts.rawUserText ?? [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

	// --- First Pass: Simple Model ---
	// Only try simple model if not forced to use heavy
	if (!opts.forceHeavy) {
		try {
			const simpleModelId = pickModel(sampleText, { forceSimple: true }); // Force simple for first pass
			setOllamaModel(simpleModelId);
			console.log(`[llmGenerateJson] Attempting with simple model: ${simpleModelId}`);
			const firstPassResponse = await ollamaChat(
				fullMessages,
				{ temperature: opts.temperature ?? 0.1 }, // Low temp for JSON
				true // Request JSON format
			);

			if (firstPassResponse && isValidJson(firstPassResponse)) {
				console.log(`[llmGenerateJson] Simple model succeeded with valid JSON.`);
				return firstPassResponse; // Return valid JSON from simple model
			} else {
				console.warn('[llmGenerateJson] Simple model response was invalid JSON or empty.');
			}
		} catch (err) {
			console.warn('[llmGenerateJson] Simple model attempt failed:', err);
			// Proceed to heavy model fallback
		}
	} else {
		console.log('[llmGenerateJson] Skipping simple model (forceHeavy=true).');
	}

	// --- Fallback: Heavy Model ---
	try {
		const largeModelId = OLLAMA_MODELS.LARGE;
		setOllamaModel(largeModelId);
		console.log(`[llmGenerateJson] Attempting with heavy model: ${largeModelId}`);
		let heavyResponse = await ollamaChat(
			fullMessages,
			{ temperature: opts.temperature ?? 0.1 }, // Low temp for JSON
			true // Request JSON format
		);

		heavyResponse = stripThinkTags(heavyResponse); // Clean response

		// Final validation before returning
		if (heavyResponse && isValidJson(heavyResponse)) {
			console.log(`[llmGenerateJson] Heavy model succeeded with valid JSON.`);
			return heavyResponse;
		} else {
			console.error(
				'[llmGenerateJson] Heavy model response was invalid JSON or empty:',
				heavyResponse
			);
			throw new Error('Heavy model failed to generate valid JSON.');
		}
	} catch (err) {
		// Handle errors from the heavy model attempt
		const fallbackMessage = getOllamaFallbackResponse(
			err instanceof OllamaApiError ? err : undefined
		);
		console.error('[llmGenerateJson] Heavy model attempt failed:', err);
		throw new Error(`LLM JSON generation failed: ${fallbackMessage}`); // Re-throw a more informative error
	}
}

/* ------------------------------------------------------------------ */
/* Other utilities                                                  */
/* ------------------------------------------------------------------ */

// Placeholder/Example: Might be used later for routing to different backends
export async function chooseBackendForTask(_: {
	type: 'chat' | 'json' | 'extraction' | 'analysis';
	complexity: 'low' | 'medium' | 'high';
	inputLength: number;
}): Promise<'ollama'> {
	// Currently always returns 'ollama'
	return 'ollama';
}

// Wrapper for the client's fallback response generator
export function getLLMFallbackResponse(error?: unknown): string {
	return getOllamaFallbackResponse(error);
}

// Gets the currently selected model ID from the uiStore
export function getCurrentModelId(): string {
	try {
		// --- Read state directly from uiStore ---
		const uiState = get(uiStore);
		return uiState.selectedModel || OLLAMA_CONFIG.model; // Use default from config if not set
	} catch (e) {
		console.error('Error reading selected model from uiStore, using default:', e);
		// Fallback to default config model if store access fails
		return OLLAMA_CONFIG.model;
	}
}

// Re-export OllamaApiError for convenience
export { OllamaApiError };

// Factory functions for creating message objects
export function makeUserMsg(content: string): ChatMessage {
	return { role: 'user', content };
}
export function makeSystemMsg(content: string): ChatMessage {
	return { role: 'system', content };
}
