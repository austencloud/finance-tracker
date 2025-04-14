// src/lib/config/ai-config.ts

// Define available model identifiers
export const AI_MODELS = {
	// Standard chat model
	CHAT: 'deepseek-chat',
	// Reasoner model (confirm exact identifier from DeepSeek documentation)
	REASONER: 'deepseek-reasoner'
	// Add other models here if needed
	// EXAMPLE_OTHER: 'some-other-model-id'
};

// Base AI configuration
export const AI_CONFIG = {
	// Load API Key from environment variables
	apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || '',
	// Base API URL
	apiUrl: 'https://api.deepseek.com/v1',
	// Default chat completions endpoint (assuming both models use this for now)
	// If 'reasoner' uses a different endpoint, you'll need separate config entries
	chatEndpoint: '/chat/completions',
	// Load Organization ID if applicable
	organization: import.meta.env.VITE_DEEPSEEK_ORG_ID || '',

	// --- Model Capabilities (Assumptions - VERIFY WITH DOCS!) ---
	// Define which models support specific features like JSON mode.
	// This helps manage parameter differences in the client.
	// **IMPORTANT**: Verify these assumptions with official DeepSeek documentation!
	modelsSupportingJsonMode: [
		AI_MODELS.CHAT // Assume chat supports it
		// DO NOT ADD AI_MODELS.REASONER HERE
	],
};

// Basic validation for API key
if (!AI_CONFIG.apiKey || AI_CONFIG.apiKey === 'sk-') {
	console.warn('VITE_DEEPSEEK_API_KEY is not set or invalid in your environment variables.');
	// Optionally throw an error or handle this case more gracefully
}
