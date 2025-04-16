/*  ────────────────────────────────────────────────────────────────────
    Local‑only LLM helper – picks between llama3:latest (fast) and
    deepseek‑r1:8b (deeper reasoning) on the fly.
    -------------------------------------------------------------------
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

import {
	OLLAMA_CONFIG,
	OLLAMA_MODELS // export should contain { SMALL: 'llama3:latest', LARGE: 'deepseek-r1:8b' }
} from '$lib/config/ai-config';

/* ------------------------------------------------------------------ */
/*  Simple helpers                                                    */
/* ------------------------------------------------------------------ */

/** Very rough heuristic for “simple” extraction */
function isSimple(text: string): boolean {
	const lenOK = text.length < 120; // short sentence
	const linesOK = text.split(/\n/).length === 1; // single‑line
	const onlyOne$ = (text.match(/\$\s?-?\d+/g) ?? []).length <= 1;
	return lenOK && linesOK && onlyOne$;
}

/* --------------------------------------------------------------- */
/*  pickModel – now honours forceHeavy and classifies better       */
/* --------------------------------------------------------------- */
interface ChatOpts {
	temperature?: number;
	forceHeavy?: boolean;
	requestJsonFormat?: boolean;
	rawUserText?: string; // <─ pass the real user line here
}
interface PickOpts {
	forceHeavy?: boolean;
}
export function pickModel(text = '', opts: PickOpts = {}): string {
	if (opts.forceHeavy) return OLLAMA_MODELS.LARGE; // caller insists

	const shortEnough = text.length < 120;
	const singleLine = !text.includes('\n');
	const oneAmountOnly = (text.match(/\$\s?-?\d+/g) ?? []).length <= 1;
	const hasCommaList = /,.*\d{2,}/.test(text); // e.g. CSV/bulk paste

	return shortEnough && singleLine && oneAmountOnly && !hasCommaList
		? OLLAMA_MODELS.SMALL // ← llama3:latest
		: OLLAMA_MODELS.LARGE; // ← deepseek‑r1
}

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type LlmMessage = ChatMessage;

/* ------------------------------------------------------------------ */
/*  Public: quick health‑check                                        */
/* ------------------------------------------------------------------ */

export async function testLLMWithSimpleRequest(): Promise<boolean> {
	const modelId = pickModel('hello'); // arbitrary – just to set any model
	setOllamaModel(modelId);
	console.log('[testLLMWithSimpleRequest] Testing Ollama model:', modelId);

	const running = await isOllamaAvailable();
	if (!running) {
		console.log('[testLLMWithSimpleRequest] Ollama service not running');
		return false;
	}

	try {
		const res = await ollamaChat(
			[{ role: 'user', content: 'Reply "working" if you hear me.' }],
			{ temperature: 0.1 },
			false
		);
		const ok = String(res).toLowerCase().includes('working');
		console.log('[testLLMWithSimpleRequest] Response:', res);
		return ok;
	} catch (err) {
		console.warn('[testLLMWithSimpleRequest] Chat failed:', err);
		return false;
	}
}
let lastPing = 0;
let lastPingOK = false;
export async function isLLMAvailable(maxAgeMs = 60_000): Promise<boolean> {
	if (Date.now() - lastPing < maxAgeMs) return lastPingOK;

	try {
		await ollamaChat([{ role: 'user', content: 'ping' }], { temperature: 0 }, false);
		lastPingOK = true;
	} catch {
		lastPingOK = false;
	}
	lastPing = Date.now();
	return lastPingOK;
}

/* ------------------------------------------------------------------ */
/*  Core chat helpers                                                 */
/* ------------------------------------------------------------------ */

export async function llmChat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<string> {
	/* ▸ use the caller‑supplied snippet, falling back to the last user role */
	const sizingSample =
		opts.rawUserText ?? [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

	const model = pickModel(sizingSample, opts); // unchanged helper
	setOllamaModel(model);

	const reply = await ollamaChat(
		messages,
		{ temperature: opts.temperature ?? 0.7 },
		opts.requestJsonFormat ?? false
	);

	return reply ?? '';
}

/** Chat that must return valid JSON */
export async function llmGenerateJson(
	messages: ChatMessage[],
	opts: Omit<ChatOpts, 'requestJsonFormat'> = {}
): Promise<string> {
	return llmChat(messages, { ...opts, requestJsonFormat: true });
}
/* ------------------------------------------------------------------ */
/*  Compatibility helpers                                             */
/* ------------------------------------------------------------------ */

/** In this new setup there’s always just one backend (“ollama”). */
export async function chooseBackendForTask(_: {
	type: 'chat' | 'json' | 'extraction' | 'analysis';
	complexity: 'low' | 'medium' | 'high';
	inputLength: number;
}): Promise<'ollama'> {
	return 'ollama';
}

/** Unified fallback message */
export function getLLMFallbackResponse(error?: unknown): string {
	return getOllamaFallbackResponse(error);
}

export { OllamaApiError };

/* ------------------------------------------------------------------ */
/*  Store convenience: expose which model is active                   */
/* ------------------------------------------------------------------ */

export function getCurrentModelId(): string {
	try {
		const sel = get(appStore).ui.selectedModel;
		return sel || OLLAMA_CONFIG.model;
	} catch {
		return OLLAMA_CONFIG.model;
	}
}

/* ------------------------------------------------------------------ */
/*  (Optional) helper to build system/user messages more easily       */
/* ------------------------------------------------------------------ */

export function makeUserMsg(content: string): ChatMessage {
	return { role: 'user', content };
}
export function makeSystemMsg(content: string): ChatMessage {
	return { role: 'system', content };
}
