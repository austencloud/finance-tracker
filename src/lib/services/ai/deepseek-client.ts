// src/lib/services/ai/deepseek-client.ts
// Update function name to match what's being imported in llm.ts

// Export the chat function with the correct name (llmChat)
export async function llmChat(
	messages: { role: string; content: string }[],
	options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
	// Implementation remains the same as the original function
	// This is the function previously called `deepseekChat` but renamed to match imports
	console.log(`[deepseek-client.llmChat] Sending ${messages.length} messages to DeepSeek...`);
	// Rest of implementation...

	// Return the message content as a string
	return 'DeepSeek response text'; // Replace with actual implementation
}

// Make sure other functions are also properly exported
export async function deepseekGenerateJson(
	prompt: string,
	systemPrompt?: string,
	options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
	// Implementation remains the same
	console.log(`[deepseekGenerateJson] Sending prompt for JSON output...`);
	// Rest of implementation...

	return 'DeepSeek JSON response'; // Replace with actual implementation
}

export async function isLLMAvailable(): Promise<boolean> {
	// Implementation remains the same
	return true; // Replace with actual implementation
}

export function getDeepSeekFallback(error?: unknown): string {
	// Implementation remains the same
	return 'Error message'; // Replace with actual implementation
}

// Make sure to export the error class
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
