// src/lib/config/ai-config.ts

// --- Backend Selection ---
// Change this to 'ollama' to use Ollama, or 'deepseek' to use DeepSeek
export const AI_BACKEND_TO_USE: string = 'ollama';

// --- DeepSeek Configuration ---
export const DEEPSEEK_CONFIG = {
	apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || '',
	apiUrl: 'https://api.deepseek.com/v1',
	chatEndpoint: '/chat/completions'
};

// --- Ollama Configuration ---
export const OLLAMA_CONFIG = {
	// Default Ollama API endpoint
	apiUrl: 'http://localhost:11434/api',

	// FIX: Use a model you have installed instead of 'llama3:8b-instruct'
	// Use 'llama3:latest' since we can see it was discovered in your logs
	model: 'llama3:latest',

	// Ollama endpoints (adjust based on current Ollama API - they may have changed)
	chatEndpoint: '/chat',
	generateEndpoint: '/generate',
	embeddingEndpoint: '/embeddings'
};

// --- Validation ---
if (
	AI_BACKEND_TO_USE === 'deepseek' &&
	(!DEEPSEEK_CONFIG.apiKey || DEEPSEEK_CONFIG.apiKey === 'sk-')
) {
	console.warn('AI Backend set to DeepSeek, but VITE_DEEPSEEK_API_KEY is not set or invalid.');
}
if (AI_BACKEND_TO_USE === 'ollama' && !OLLAMA_CONFIG.model) {
	console.warn(
		'AI Backend set to Ollama, but OLLAMA_CONFIG.model is not specified in ai-config.ts.'
	);
}
export const OLLAMA_MODELS = {
	SMALL: 'llama3:latest', // fast, ~8 GB vRAM
	LARGE: 'deepseek-r1:8b' // needs ~12 GB vRAM on a 3070
};
