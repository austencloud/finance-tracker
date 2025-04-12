// src/utils/llm-conversation-manager.ts
import { writable, get } from 'svelte/store';
import type { Transaction } from '../../types';
// Import prompt functions
import { getSystemPrompt, getSummaryPrompt, getExtractionPrompt } from './llm-prompts';
// Assuming llm-client handles API calls now, replace direct fetch if needed
// For this fix, assuming sendMessagesToLLM is still defined locally or imported correctly
// Also assuming extractTransactionsFromTextInternal is defined locally or imported
import { parseTransactionsFromLLMResponse } from './llm-transaction-parser'; // Keep if used by extractTransactionsFromTextInternal
import { generateTransactionId } from './helpers';
import { categorizeTransaction } from './categorizer';
import { ollamaChat, ollamaGenerateJson } from './llm-client'; // Assuming client handles fetch

// --- Stores (Consider moving to conversation-store.ts if using refactored structure) ---
export const conversationActive = writable(false);
export const conversationMessages = writable<{ role: string; content: string }[]>([]);
export const conversationProgress = writable(0);
export const extractedTransactions = writable<Transaction[]>([]);
export const conversationStatus = writable('');
// Internal state (Consider moving to conversation-store.ts)
let isProcessingData = false;
let initialPromptSent = false;
// --- End Stores ---

// --- Lifecycle Functions (Consider moving to conversation-lifecycle.ts) ---
export function startOrInitializeConversation(): void {
	if (get(conversationMessages).length === 0) {
		console.log('[startOrInitializeConversation] Initializing chat.');
		conversationMessages.set([
			{
				role: 'assistant',
				content:
					"Hello! I'm your AI Transaction Assistant. Paste your transaction data, type it out, or describe your spending, and I'll help you organize it. How can I help you get started?"
			}
		]);
		conversationActive.set(true);
		extractedTransactions.set([]);
		conversationProgress.set(0);
		conversationStatus.set('');
		initialPromptSent = false;
	}
}

function resetConversationState(): void {
	console.log('[resetConversationState] Resetting chat state.');
	conversationActive.set(false);
	conversationMessages.set([]);
	conversationProgress.set(0);
	conversationStatus.set('');
	extractedTransactions.set([]);
	isProcessingData = false; // Use internal variable if not using store
	initialPromptSent = false;
}

export function finishConversation(): Transaction[] {
	console.log('[finishConversation] Completing conversation.');
	const transactions = get(extractedTransactions);
	resetConversationState();
	return transactions;
}

export function cancelConversation(): void {
	console.log('[cancelConversation] Aborting conversation.');
	resetConversationState();
}
// --- End Lifecycle Functions ---

// --- Core Service Logic (Consider moving to conversation-service.ts) ---

// Internal helper mimicking llm-client.ts for context if not refactored
async function sendMessagesToLLM(messages: { role: string; content: string }[]): Promise<string> {
	// Replace this with actual import and call to ollamaChat if using llm-client.ts
	console.log('[sendMessagesToLLM] Using ollamaChat client with messages:', messages.length);
	return await ollamaChat(messages); // Use the actual client call
}

async function processInitialData(text: string): Promise<void> {
	console.log('[processInitialData] ATTEMPT 3 START processing:', text);
	if (isProcessingData) {
		console.log('[processInitialData] Already processing, returning.');
		return;
	}

	isProcessingData = true;
	conversationProgress.set(20);
	conversationStatus.set('Analyzing your initial data...');

	let assistantResponse = '';
	let success = false;
	const today = new Date().toISOString().split('T')[0]; // Get today's date

	try {
		console.log('[processInitialData] Calling extractTransactionsFromTextInternal...');
		const transactions = await extractTransactionsFromTextInternal(text); // Assumes this function exists and is correct
		console.log(
			'[processInitialData] extractTransactionsFromTextInternal raw result:',
			transactions
		);

		if (transactions && Array.isArray(transactions) && transactions.length > 0) {
			console.log('[processInitialData] Transactions found:', transactions.length);
			extractedTransactions.update((txns) => [...txns, ...transactions]);
			conversationProgress.set(80);
			conversationStatus.set(`Processed ${transactions.length} potential transaction(s).`);
			const isIncomplete = transactions.some(
				(t) =>
					t.description === 'unknown' ||
					t.description === '' ||
					t.date === 'unknown' ||
					t.date === '' ||
					t.amount === 0 ||
					t.direction === 'unknown'
			);
			console.log('[processInitialData] Is transaction list incomplete?', isIncomplete);

			if (isIncomplete) {
				const clarificationPrompt = `The user just provided this input: "${text}". I extracted the following partial data: ${JSON.stringify(transactions)}. Based on the system prompt rules (asking for missing details), ask a friendly, specific question to get the missing details (like the purpose or date). DO NOT greet the user again.`;
				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					// *** FIX: Pass today's date ***
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMessages,
					{ role: 'system', content: clarificationPrompt }
				];
				console.log(
					'[processInitialData] Calling sendMessagesToLLM for *incomplete* transaction clarification...'
				);
				assistantResponse = await sendMessagesToLLM(apiMessages);
				console.log(
					'[processInitialData] Incomplete clarification response received:',
					assistantResponse
				);
			} else {
				assistantResponse = `Got it! I've recorded ${transactions.length} transaction(s) based on your input: ${JSON.stringify(transactions)}. You can ask for a summary or add more transactions.`;
				console.log('[processInitialData] Set response for complete transaction.');
			}
			success = true;
		} else {
			console.log('[processInitialData] No transactions extracted.');
			const looksLikeTxn = userInputLooksLikeTransaction(text); // Assumes this util exists
			console.log('[processInitialData] Does input look like transaction?', looksLikeTxn);

			if (looksLikeTxn) {
				conversationStatus.set('Needs clarification...');
				const clarificationPrompt = `The user provided this input: "${text}". My extraction process failed, but it looks like a transaction. Based on the system prompt rules (asking for missing details instead of failing), please formulate a friendly question to the user to understand what transaction they meant. Ask for details like amount, date, and purpose/description. IMPORTANT: Do NOT repeat the initial assistant greeting. Just ask the question directly.`;
				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					// *** FIX: Pass today's date ***
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMessages,
					{ role: 'system', content: clarificationPrompt }
				];
				console.log(
					'[processInitialData] Calling sendMessagesToLLM for FAILED extraction clarification...'
				);
				assistantResponse = await sendMessagesToLLM(apiMessages);
				console.log(
					'[processInitialData] Failed extraction clarification response received:',
					assistantResponse
				);
			} else {
				conversationStatus.set('No transaction data detected.');
				const visibleMessages = get(conversationMessages);
				const apiMessages = [
					// *** FIX: Pass today's date ***
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMessages,
					{
						role: 'system',
						content:
							"The user's message didn't seem to contain transaction data. Respond conversationally and ask how you can help with their transactions. Do not repeat the initial greeting."
					}
				];
				console.log('[processInitialData] Calling sendMessagesToLLM for generic response...');
				assistantResponse = await sendMessagesToLLM(apiMessages);
				console.log('[processInitialData] Generic response received:', assistantResponse);
			}
			// Check for problematic response
			if (
				!assistantResponse ||
				assistantResponse.toLowerCase().includes("hello! i'm your ai transaction assistant")
			) {
				console.warn('[processInitialData] Received empty or problematic response...');
				assistantResponse = `I saw you mentioned "${text}". Could you please provide a bit more detail like the date, amount, and purpose?`;
				success = false;
			} else {
				success = true;
			}
		}

		console.log('[processInitialData] Final assistantResponse:', assistantResponse);
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: assistantResponse }
		]);
	} catch (error) {
		console.error('[processInitialData] Error:', error);
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: 'I encountered an issue while analyzing that data...' }
		]);
		conversationStatus.set('Error during analysis.');
		success = false; // Ensure success is false on error
	} finally {
		conversationProgress.set(100);
		setTimeout(() => conversationProgress.set(0), 1500);
		conversationStatus.set('');
		isProcessingData = false;
		initialPromptSent = success; // Only true if no error and LLM didn't give bad response
		console.log(`[processInitialData] END, initialPromptSent set to: ${initialPromptSent}`);
	}
}

// Internal extraction helper (assuming it exists and uses getExtractionPrompt)
async function extractTransactionsFromTextInternal(text: string): Promise<Transaction[]> {
	console.log('[extractTransactionsFromTextInternal] START extracting from:', text);
	const today = new Date().toISOString().split('T')[0]; // Get today's date
	// *** FIX: Pass today's date ***
	const extractionPrompt = getExtractionPrompt(text, today);
	try {
		// Replace with actual call to ollamaGenerateJson if using llm-client.ts
		console.log('[extractTransactionsFromTextInternal] Calling ollamaGenerateJson...');
		const rawJsonResponse = await ollamaGenerateJson(extractionPrompt); // Use actual client
		console.log('[extractTransactionsFromTextInternal] Raw LLM response string:', rawJsonResponse);
		// Assumes parseTransactionsFromLLMResponse is imported or defined correctly
		const parsedResult = parseTransactionsFromLLMResponse(rawJsonResponse);
		console.log('[extractTransactionsFromTextInternal] Parsing result:', parsedResult);
		return parsedResult;
	} catch (error) {
		console.error('[extractTransactionsFromTextInternal] Error:', error);
		return [];
	}
}

export async function sendUserMessage(message: string): Promise<void> {
	// Use internal variable if not using store
	if (isProcessingData) {
		console.warn('[sendUserMessage] Already processing, message ignored:', message);
		return;
	}
	// Add user message to conversation FIRST
	conversationMessages.update((msgs) => [...msgs, { role: 'user', content: message }]);

	// Check if this is the first message needing processing
	if (!initialPromptSent) {
		// Use internal variable if not using store
		await processInitialData(message);
		return;
	}

	// If it's not the first message, proceed with normal chat interaction
	conversationStatus.set('Thinking...');
	isProcessingData = true; // Use internal variable if not using store
	const today = new Date().toISOString().split('T')[0]; // Get today's date
	let assistantResponse = '';

	try {
		const visibleMessages = get(conversationMessages);
		// *** FIX: Pass today's date ***
		const apiMessages = [{ role: 'system', content: getSystemPrompt(today) }, ...visibleMessages];

		// Use actual client call
		assistantResponse = await sendMessagesToLLM(apiMessages);

		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: assistantResponse }
		]);
	} catch (error) {
		console.error('Error sending user message:', error);
		assistantResponse = "I'm having some trouble processing that...";
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: assistantResponse }
		]);
		conversationStatus.set('Error');
	} finally {
		conversationStatus.set('');
		isProcessingData = false; // Use internal variable if not using store
	}
}

export async function showTransactionSummary(): Promise<void> {
	if (isProcessingData) return; // Use internal variable if not using store

	const transactions = get(extractedTransactions);
	if (transactions.length === 0) {
		const assistantMsg = get(conversationMessages).length <= 2 ? '...' : '...';
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content: assistantMsg }]);
		return;
	}

	conversationStatus.set('Generating summary...');
	isProcessingData = true; // Use internal variable if not using store
	const today = new Date().toISOString().split('T')[0]; // Get today's date
	let summaryResponse = '';

	try {
		const summaryPrompt = getSummaryPrompt(transactions);
		const summaryMessages = [
			// *** FIX: Pass today's date ***
			{ role: 'system', content: getSystemPrompt(today) },
			{ role: 'user', content: `Here are the transactions... ${JSON.stringify(transactions)}` },
			{ role: 'user', content: summaryPrompt }
		];
		summaryResponse = await sendMessagesToLLM(summaryMessages); // Assumes this exists
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: summaryResponse }
		]);
	} catch (error) {
		console.error('Error showing transaction summary:', error);
		const fallbackMessage = `Error generating summary...`;
		conversationMessages.update((msgs) => [
			...msgs,
			{ role: 'assistant', content: fallbackMessage }
		]);
		conversationStatus.set('Error Generating Summary');
	} finally {
		conversationStatus.set('');
		isProcessingData = false; // Use internal variable if not using store
	}
}
// --- End Core Service Logic ---

// --- Keep other helpers like userInputLooksLikeTransaction if defined here ---
// Make sure this import is correct if it's in conversation-utils.ts
// import { userInputLooksLikeTransaction } from './conversation-utils';
function userInputLooksLikeTransaction(text: string): boolean {
	const lowerText = text.toLowerCase();
	const hasAmount =
		/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd|cad|eur|gbp)/i.test(
			lowerText
		) || /\b\d+\b/.test(lowerText);
	const hasKeyword =
		/\b(spent|paid|bought|sold|received|deposit|income|expense|cost|got|transfer|sent|charge|fee|payment|salary|invoice|refund)\b/i.test(
			lowerText
		);
	const hasDate =
		/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}|\b(yesterday|today|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
			lowerText
		);
	return hasAmount || (hasKeyword && hasDate);
}
// ---
