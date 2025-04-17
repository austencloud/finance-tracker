// F:\CODE\income-calculator\src\lib\services\ai\llm-helpers.ts
/*  ────────────────────────────────────────────────────────────────────
    Local‑only LLM helper – picks between llama3:latest (fast) and
    deepseek‑r1:8b (deeper reasoning) on the fly, with a simple‑model
    sanity check before escalating.
*/

import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

import { appStore } from '$lib/stores/AppStore';
import {
	ollamaChat,
	isOllamaAvailable,
	getOllamaFallbackResponse,
	OllamaApiError,
	setOllamaModel
} from './ollama-client';

import { OLLAMA_CONFIG, OLLAMA_MODELS } from '$lib/config/ai-config';
import { logDebug } from '$lib/config/log';
import { getSystemPrompt } from './prompts';

/* ------------------------------------------------------------------ */
/*  Simple heuristics & helpers                                       */
/* ------------------------------------------------------------------ */

function isSimpleRequest(text: string): boolean {
	const lenOK = text.length < 140;
	const singleLine = !text.includes('\n');
	const oneAmount = (text.match(/\$\s?-?\d[\d,]*\.?\d*/g) ?? []).length <= 1;
	// detect CSV‑like bulk
	const csvLike = text.split('\n').some((l) => l.split(',').length > 3);
	const hasCommaList = csvLike && !oneAmount;
	return lenOK && singleLine && oneAmount && !hasCommaList;
}

function stripThinkTags(s: string): string {
	return s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function isValidJson(str: string): boolean {
	try {
		JSON.parse(str);
		return true;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ */
/*  Model picker                                                     */
/* ------------------------------------------------------------------ */
export function pickModel(
	text = '',
	opts: { forceHeavy?: boolean; forceSimple?: boolean } = {}
): string {
	if (opts.forceSimple) return OLLAMA_MODELS.SMALL;
	if (opts.forceHeavy) return OLLAMA_MODELS.LARGE;
	return isSimpleRequest(text) ? OLLAMA_MODELS.SMALL : OLLAMA_MODELS.LARGE;
}

/* ------------------------------------------------------------------ */
/*  Check availability                                               */
/* ------------------------------------------------------------------ */
let lastPing = 0;
let lastPingOK = false;

export async function testLLMWithSimpleRequest(): Promise<boolean> {
	const modelId = pickModel('hello', { forceSimple: true });
	setOllamaModel(modelId);
	logDebug('[testLLM] pinging model:', modelId);
	try {
		const res = await ollamaChat(
			[{ role: 'user', content: 'Reply "working" if you hear me.' }],
			{ temperature: 0.1 },
			false
		);
		return String(res).toLowerCase().includes('working');
	} catch {
		return false;
	}
}



/* ------------------------------------------------------------------ */
/*  Core chat & JSON generation                                      */
/* ------------------------------------------------------------------ */
type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export async function llmChat(
	messages: ChatMessage[],
	opts: {
		temperature?: number;
		forceHeavy?: boolean;
		forceSimple?: boolean;
		requestJsonFormat?: boolean;
		rawUserText?: string;
	} = {}
): Promise<string> {
	const sample =
		opts.rawUserText ?? [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
	const model = pickModel(sample, opts);
	setOllamaModel(model);
	const raw = await ollamaChat(
		messages,
		{ temperature: opts.temperature ?? 0.7 },
		opts.requestJsonFormat ?? false
	);
	const reply = raw ?? '';
	const cleaned = reply
		.replace(/<think>[\s\S]*?<\/think>/gi, '')
		.replace(/^<think>.*$/gmi, '')
		.trim();
	return cleaned;
}

/**
 * Two‑pass JSON generator: try simple model + verify, then fallback heavy
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
	const system = getSystemPrompt(today);
	const full = [makeSystemMsg(system), ...messages];

	// first pass: simple model
	const sample =
		opts.rawUserText ?? [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
	let first: string | null = null;
	try {
		const simpleModel = pickModel(sample, { forceSimple: opts.forceSimple });
		setOllamaModel(simpleModel);
		first = await ollamaChat(full, { temperature: opts.temperature ?? 0.1 }, true);
		if (first && isValidJson(first)) {
			const verify = await ollamaChat(full, { temperature: opts.temperature ?? 0.1 }, true);
			if (verify && isValidJson(verify)) {
				return first;
			}
		}
	} catch (err) {
		console.warn('Simple‑model JSON attempt failed:', err);
	}

	// fallback: heavy model
	try {
		setOllamaModel(OLLAMA_MODELS.LARGE);
		let heavy = await ollamaChat(full, { temperature: opts.temperature ?? 0.1 }, true);
		heavy = stripThinkTags(heavy);
		return heavy;
	} catch (err) {
		const fb = getOllamaFallbackResponse(err instanceof OllamaApiError ? err : undefined);
		throw new Error(`llmGenerateJson failed: ${fb}`);
	}
}

/* ------------------------------------------------------------------ */
/*  Other utilities                                                  */
/* ------------------------------------------------------------------ */
export async function chooseBackendForTask(_: {
	type: 'chat' | 'json' | 'extraction' | 'analysis';
	complexity: 'low' | 'medium' | 'high';
	inputLength: number;
}): Promise<'ollama'> {
	return 'ollama';
}

export function getLLMFallbackResponse(error?: unknown): string {
	return getOllamaFallbackResponse(error);
}

export function getCurrentModelId(): string {
	try {
		return get(appStore).ui.selectedModel || OLLAMA_CONFIG.model;
	} catch {
		return OLLAMA_CONFIG.model;
	}
}

export { OllamaApiError };

export function makeUserMsg(content: string): ChatMessage {
	return { role: 'user', content };
}
export function makeSystemMsg(content: string): ChatMessage {
	return { role: 'system', content };
}
