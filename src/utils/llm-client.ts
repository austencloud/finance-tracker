// src/utils/llm.client.ts

// Basic Ollama API configuration
const OLLAMA_BASE_URL = 'http://localhost:11434/api';
const CHAT_MODEL = 'llama3'; // Or your preferred chat model
const EXTRACTION_MODEL = 'llama3'; // Can be the same or different

/**
 * Sends messages to the Ollama Chat API.
 * @param messages - Array of message objects ({ role: string, content: string }).
 * @returns The content of the assistant's response message.
 * @throws If the API request fails or the response structure is unexpected.
 */
export async function ollamaChat(messages: { role: string; content: string }[]): Promise<string> {
	console.log(`[ollamaChat] Sending ${messages.length} messages to ${CHAT_MODEL}...`);
	const url = `${OLLAMA_BASE_URL}/chat`;
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CHAT_MODEL,
				messages: messages,
				stream: false
				// options: { temperature: 0.7 } // Optional parameters
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error(`[ollamaChat] API Error (${response.status}):`, errorBody);
			throw new Error(`Ollama Chat API error: ${response.status}`);
		}

		const data = await response.json();
		if (data.message && typeof data.message.content === 'string') {
			console.log('[ollamaChat] Received response.');
			return data.message.content;
		} else {
			console.error('[ollamaChat] Unexpected response structure:', data);
			throw new Error('Unexpected Ollama Chat response structure');
		}
	} catch (error) {
		console.error('[ollamaChat] Fetch error:', error);
		// Re-throw fetch errors or connection issues
		throw error;
	}
}

/**
 * Sends a prompt to the Ollama Generate API, expecting JSON output.
 * @param prompt - The prompt string.
 * @param systemPrompt - Optional system prompt for context.
 * @returns The raw response string from the LLM (expected to be JSON).
 * @throws If the API request fails.
 */
export async function ollamaGenerateJson(prompt: string, systemPrompt?: string): Promise<string> {
	console.log(`[ollamaGenerateJson] Sending prompt to ${EXTRACTION_MODEL}...`);
	const url = `${OLLAMA_BASE_URL}/generate`;
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: EXTRACTION_MODEL,
				prompt: prompt,
				system: systemPrompt, // Add system prompt if provided
				format: 'json', // Request JSON format
				stream: false,
				raw: true // Often helpful for JSON extraction
				// options: { temperature: 0.3 } // Lower temp for more deterministic JSON
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[ollamaGenerateJson] API Error (${response.status}):`, errorText);
			throw new Error(`Ollama Generate API error: ${response.status}`);
		}
		const data = await response.json();

		if (typeof data.response === 'string') {
			console.log('[ollamaGenerateJson] Received response.');
			return data.response;
		} else {
			console.error('[ollamaGenerateJson] Unexpected response structure:', data);
			throw new Error("Unexpected Ollama Generate response structure (missing 'response' string)");
		}
	} catch (error) {
		console.error('[ollamaGenerateJson] Fetch error:', error);
		// Re-throw fetch errors or connection issues
		throw error;
	}
}
