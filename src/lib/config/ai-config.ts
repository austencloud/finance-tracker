// src/lib/config/ai-config.ts

export const AI_MODELS = {
	CHAT: 'deepseek-chat',
	REASONER: 'deepseek-reasoner'
};

export const AI_CONFIG = {
	apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || '',
	apiUrl: 'https://api.deepseek.com/v1',
	chatEndpoint: '/chat/completions',
	organization: import.meta.env.VITE_DEEPSEEK_ORG_ID || '',
	modelsSupportingJsonMode: [
		AI_MODELS.CHAT
	],
};

if (!AI_CONFIG.apiKey || AI_CONFIG.apiKey === 'sk-') {
	console.warn('VITE_DEEPSEEK_API_KEY is not set or invalid in your environment variables.');
}
