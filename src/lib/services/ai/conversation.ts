import { writable, get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { ollamaChat } from './llm-client';
import { getSystemPrompt, getSummaryPrompt } from './prompts';
// Ensure extractTransactionsFromText can handle being called with assistant responses too
import { extractTransactionsFromText } from './extraction';
import { textLooksLikeTransaction, generateTransactionId } from '$lib/utils/helpers'; // Assuming generateTransactionId is here
import { resolveAndFormatDate } from '$lib/utils/date'; // Ensure this is imported if used directly

// Stores
export const conversationMessages = writable<{ role: string; content: string }[]>([]);
export const conversationStatus = writable('');
export const isProcessing = writable(false);
export const conversationProgress = writable(0);
export const extractedTransactions = writable<Transaction[]>([]);
export const userMood = writable<'neutral' | 'frustrated' | 'chatty' | 'unknown'>('unknown');

// State variables
let initialPromptSent = false;
let messageInProgress = false;

// --- Initialization and Reset ---

export function initializeConversation(): void {
	resetConversationState();
	conversationMessages.set([
		{
			role: 'assistant',
			content:
				"Hello! I'm your AI Transaction Assistant. Paste your transaction data, type it out, or describe your spending, and I'll help you organize it. How can I help you get started?"
		}
	]);
}

export function resetConversationState(): void {
	conversationMessages.set([]);
	conversationProgress.set(0);
	conversationStatus.set('');
	extractedTransactions.set([]);
	isProcessing.set(false);
	userMood.set('unknown');
	initialPromptSent = false;
	messageInProgress = false;
}

// --- Conversation Actions ---

export function completeConversation(): Transaction[] {
	const transactionsToAdd = get(extractedTransactions);
	// Maybe add a final confirmation message before resetting?
	// safeAddAssistantMessage(`Okay, adding ${transactionsToAdd.length} transaction(s) to your main list.`);
	resetConversationState();
	return transactionsToAdd;
}

export function abortConversation(): void {
	// Maybe add a confirmation message?
	// safeAddAssistantMessage("Okay, I've cleared the current conversation and any extracted data.");
	resetConversationState();
}

// --- Internal Helpers ---

function safeAddAssistantMessage(content: string): void {
	// Basic lock to prevent rapid-fire message additions, adjust timeout if needed
	if (messageInProgress) {
		console.warn('[safeAddAssistantMessage] Currently locked, skipping:', content);
		return;
	}
	messageInProgress = true;
	try {
		conversationMessages.update((msgs) => [...msgs, { role: 'assistant', content }]);
	} finally {
		setTimeout(() => {
			messageInProgress = false;
		}, 100); // Increased delay slightly
	}
}

// Utility to format date for display in assistant messages if needed elsewhere
function formatDateForDisplay(dateStr: string): string {
	if (!dateStr || dateStr === 'unknown') return 'an unknown date';
	try {
		// Use the robust resolver first
		const resolvedDate = resolveAndFormatDate(dateStr);
		if (resolvedDate !== 'unknown' && resolvedDate !== dateStr) {
			const d = new Date(resolvedDate + 'T00:00:00'); // Add time to avoid timezone issues
			if (!isNaN(d.getTime())) {
				return d.toLocaleDateString('en-US', {
					weekday: 'long',
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				});
			}
		}
		// Fallback for already formatted or unresolvable strings
		const d = new Date(dateStr + 'T00:00:00');
		if (!isNaN(d.getTime())) {
			return d.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		}
		return dateStr; // Return original if all parsing fails
	} catch {
		return dateStr; // Fallback on any error
	}
}

// --- Main Message Handler ---

export async function sendUserMessage(message: string): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[sendUserMessage] Already processing. Ignored:', message);
		return;
	}

	// 1) Immediately add the user message & set status
	conversationMessages.update((msgs) => [...msgs, { role: 'user', content: message }]);
	conversationStatus.set('Thinking...');
	isProcessing.set(true);

	let assistantResponse = '';
	const today = new Date().toISOString().split('T')[0];
	let correctionApplied = false; // Flag to track if we applied a correction

	try {
		// --- A) Mood Detection (Existing Logic) ---
		let currentMood = get(userMood);
		if (/\b(mad|angry|annoyed|upset|pissed|frustrated|stupid|wrong)\b/i.test(message)) {
			currentMood = 'frustrated';
			userMood.set(currentMood);
			console.log('[sendUserMessage] Detected user frustration.');
			assistantResponse =
				'I apologize if I made a mistake or caused frustration. How can I correct it or help better?';
			safeAddAssistantMessage(assistantResponse);
			isProcessing.set(false);
			conversationStatus.set('');
			return;
		} else if (/(\bstory\b|\btesting\b|\bjust chat\b|\bjust saying\b)/i.test(message)) {
			currentMood = 'chatty';
			userMood.set(currentMood);
			console.log('[sendUserMessage] Detected chatty mood.');
			assistantResponse = 'Okay, just chatting! Let me know when you have transaction details.';
			safeAddAssistantMessage(assistantResponse);
			isProcessing.set(false);
			conversationStatus.set('');
			return;
		} else if (currentMood !== 'neutral' && !textLooksLikeTransaction(message)) {
			// Reset mood if previous mood wasn't neutral and current message isn't a transaction
			userMood.set('neutral');
			currentMood = 'neutral';
		}

		// --- B) Initial Data Processing (Existing Logic) ---
		if (!initialPromptSent && textLooksLikeTransaction(message)) {
			await processInitialData(message);
			// processInitialData handles setting isProcessing=false and status
			return;
		}

		// --- C) Normal LLM Interaction ---
		const visibleMessages = get(conversationMessages);
		const mood = get(userMood);
		let moodNote = '';
		if (mood === 'frustrated') moodNote = 'The user seems frustrated. Be extra patient and clear.';
		else if (mood === 'chatty')
			moodNote = 'The user seems chatty. Feel free to be slightly more conversational.';

		let systemPromptContent = getSystemPrompt(today);
		if (moodNote) systemPromptContent += `\n\nImportant Context: ${moodNote}`;

		const apiMessages = [{ role: 'system', content: systemPromptContent }, ...visibleMessages];
		assistantResponse = await ollamaChat(apiMessages);

		// --- D) Handle Empty/Repetitive Initial Response (Existing Logic) ---
		if (!initialPromptSent) {
			const lowerResp = assistantResponse.toLowerCase().trim();
			if (!assistantResponse || lowerResp.startsWith("hello! i'm your ai transaction assistant.")) {
				assistantResponse = `I see you mentioned "${message}". Could you provide more details like date, amount, or purpose?`;
			}
		}

		// --- E) *** NEW: Attempt Correction Logic *** ---
		// Heuristic: Check if assistant response sounds like it's confirming a correction
		// AND if there are transactions in the store to potentially correct.
		const confirmsCorrection =
			/correction:|corrected date|updated:|changed to|actually was|is now|i've updated|i'll record the transaction with a date correction/i.test(
				assistantResponse
			);
		const currentExtractedTxns = get(extractedTransactions);

		if (confirmsCorrection && currentExtractedTxns.length > 0) {
			console.log(
				'[sendUserMessage] Assistant response suggests a correction. Attempting update...'
			);
			try {
				// Try extracting details *from the assistant's confirmation message*
				// This assumes the confirmation contains the corrected details.
				const correctedTxns = await extractTransactionsFromText(assistantResponse);

				if (correctedTxns.length === 1) {
					// If exactly one transaction is found in the confirmation message,
					// assume it's the corrected version of the *last* transaction in the store.
					const correctedData = correctedTxns[0];
					const lastTxnIndex = currentExtractedTxns.length - 1;
					const lastTxnId = currentExtractedTxns[lastTxnIndex].id;

					extractedTransactions.update((txns) => {
						const indexToUpdate = txns.findIndex((t) => t.id === lastTxnId);
						if (indexToUpdate !== -1) {
							console.log(
								`[sendUserMessage] Updating transaction ID ${lastTxnId} with data extracted from assistant response:`,
								correctedData
							);
							const originalTxn = txns[indexToUpdate];

							// Careful Merge: Only update fields if the extracted correction provides a meaningful value
							txns[indexToUpdate] = {
								...originalTxn,
								date:
									correctedData.date && correctedData.date !== 'unknown'
										? correctedData.date
										: originalTxn.date,
								description:
									correctedData.description && correctedData.description !== 'unknown'
										? correctedData.description
										: originalTxn.description,
								amount:
									correctedData.amount && correctedData.amount !== 0
										? correctedData.amount
										: originalTxn.amount,
								direction:
									correctedData.direction && correctedData.direction !== 'unknown'
										? correctedData.direction
										: originalTxn.direction,
								type:
									correctedData.type && correctedData.type !== 'unknown'
										? correctedData.type
										: originalTxn.type,
								// Notes and Category are less likely to be corrected this way, keep original unless explicitly handled
								notes: originalTxn.notes, // Keep original notes for now
								category: originalTxn.category // Keep original category for now
							};
							correctionApplied = true; // Mark that we applied an update
							// Optionally modify the assistant response slightly for clarity
							// assistantResponse = `OK, I've updated the last transaction based on our chat. Details: ${JSON.stringify(txns[indexToUpdate])}. Anything else?`;
						} else {
							console.warn(
								`[sendUserMessage] Correction detected, but couldn't find last transaction ID ${lastTxnId} in store.`
							);
						}
						return [...txns]; // Return new array for reactivity
					});
				} else {
					console.log(
						'[sendUserMessage] Correction hinted, but could not reliably extract a single corrected transaction from assistant response. Proceeding without update.'
					);
				}
			} catch (err) {
				console.error('[sendUserMessage] Error during correction extraction/update attempt:', err);
				// Proceed without applying correction if error occurs
			}
		}

		// --- F) Add New Transaction Logic (Only if no correction was applied) ---
		// If the user's message looks like a transaction AND we didn't just apply a correction
		if (!correctionApplied && textLooksLikeTransaction(message)) {
			console.log(
				'[sendUserMessage] Message looks like transaction, attempting extraction to add new entry...'
			);
			try {
				const newTxns = await extractTransactionsFromText(message);
				if (newTxns.length > 0) {
					// Check for duplicates before adding? (Optional enhancement)
					extractedTransactions.update((txns) => [...txns, ...newTxns]);
					const { amount, description, date } = newTxns[0];
					const amtNum =
						typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;
					// Overwrite the general LLM response with a specific confirmation *if* we extracted successfully
					assistantResponse =
						`I've recorded $${amtNum.toFixed(2)} ` +
						`${description !== 'unknown' ? `for "${description}" ` : ''} on ${formatDateForDisplay(date)}. Anything else to add?`;
					// Reset mood if successful extraction?
					// userMood.set('neutral');
				} else if (!assistantResponse) {
					// If extraction failed AND LLM gave no useful response, provide a fallback
					assistantResponse =
						"I saw something that might be a transaction, but couldn't extract details. Could you clarify the amount, date, or purpose?";
				}
			} catch (err) {
				console.error('[sendUserMessage] Extraction error for new transaction:', err);
				if (!assistantResponse) {
					// Only overwrite if no other response exists
					assistantResponse = 'I had trouble extracting details from that. Could you try again?';
				}
			}
		}
	} catch (error) {
		console.error('[sendUserMessage] Main LLM error:', error);
		assistantResponse = "I'm having trouble processing that. Could you try rephrasing?";
		conversationStatus.set('Error'); // Set error status
	} finally {
		// Ensure we always have *some* response unless handled earlier (mood/initial exits)
		if (get(isProcessing)) {
			// Check if processing wasn't already stopped
			if (!assistantResponse || !assistantResponse.trim()) {
				// Generic fallback if no specific response was generated
				assistantResponse = "Sorry, I couldn't process that properly. Could you try again?";
			}
			safeAddAssistantMessage(assistantResponse); // Add the final assistant response

			// Mark initial prompt as sent after the first *successful* interaction cycle
			if (!initialPromptSent && (textLooksLikeTransaction(message) || assistantResponse)) {
				initialPromptSent = true;
			}

			// Reset status and processing flag
			conversationStatus.set(get(conversationStatus) === 'Error' ? 'Error' : ''); // Keep error status if set
			isProcessing.set(false);
		}
	}
}

/**
 * Processes the very first message if it looks like transaction data.
 * Separated for clarity.
 */
async function processInitialData(text: string): Promise<void> {
	conversationProgress.set(20);
	conversationStatus.set('Analyzing initial data...');
	let assistantResponse = '';
	let success = false;
	const today = new Date().toISOString().split('T')[0];

	try {
		const transactions = await extractTransactionsFromText(text);
		if (transactions && transactions.length > 0) {
			extractedTransactions.update((txns) => [...txns, ...transactions]);
			conversationProgress.set(80);

			const isIncomplete = transactions.some(
				(t) =>
					t.description === 'unknown' ||
					t.date === 'unknown' ||
					t.amount === 0 ||
					t.direction === 'unknown'
			);

			if (isIncomplete) {
				// If incomplete, ask LLM to formulate a question for missing details
				const clarPrompt = `The user just provided initial data: "${text}". I extracted: ${JSON.stringify(transactions)}. Some details are missing or marked 'unknown'. Ask concise, specific questions to get ONLY the missing details.`;
				const visibleMsgs = get(conversationMessages); // Get messages *including* the user's initial data
				const clarMessages = [
					{ role: 'system', content: getSystemPrompt(today) },
					...visibleMsgs, // Include user message
					{ role: 'system', content: clarPrompt } // Add clarification request
				];
				assistantResponse = await ollamaChat(clarMessages);
			} else {
				// If complete, provide a confirmation
				const { amount, description, date } = transactions[0];
				const amtNum =
					typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;
				assistantResponse =
					`Got it! Recorded $${amtNum.toFixed(2)} ` +
					(description !== 'unknown' ? `for "${description}" ` : '') +
					`on ${formatDateForDisplay(date)}. ` +
					(transactions.length > 1 ? `(plus ${transactions.length - 1} more)` : '') +
					' Anything else?';
			}
			success = true;
		} else {
			// If no transactions extracted from initial text
			assistantResponse =
				"Thanks for the info! It didn't look like a transaction I could record. Could you provide details like amount, date, or purpose?";
			success = false; // Didn't successfully extract
		}
		safeAddAssistantMessage(assistantResponse);
	} catch (err) {
		console.error('[processInitialData] error:', err);
		safeAddAssistantMessage(
			'I had trouble analyzing that initial data. Could you try describing the transaction?'
		);
		conversationStatus.set('Error');
	} finally {
		conversationProgress.set(100);
		setTimeout(() => conversationProgress.set(0), 1500); // Visual feedback duration
		conversationStatus.set(get(conversationStatus) === 'Error' ? 'Error' : ''); // Keep error status
		initialPromptSent = success; // Mark initial prompt handled only if successful extraction occurred
		isProcessing.set(false); // Ensure processing flag is reset here
	}
}

/**
 * Generates a summary message based on currently extracted transactions.
 */
export async function generateSummary(): Promise<void> {
	if (get(isProcessing)) {
		console.warn('[generateSummary] Already processing, ignoring...');
		return;
	}

	const txns = get(extractedTransactions);
	if (txns.length === 0) {
		safeAddAssistantMessage("I haven't recorded any transactions yet to summarize!");
		return;
	}

	conversationStatus.set('Generating summary...');
	isProcessing.set(true);

	let summaryResponse = '';
	const today = new Date().toISOString().split('T')[0];
	try {
		// Use getSummaryPrompt which formats the transactions for the LLM
		const promptContent = getSummaryPrompt(txns); // This function needs to exist and format txns appropriately
		const summaryMsgs = [
			{ role: 'system', content: getSystemPrompt(today) },
			// Provide context and the request in the user role for the LLM to summarize
			{ role: 'user', content: promptContent }
		];
		summaryResponse = await ollamaChat(summaryMsgs);
		if (!summaryResponse || !summaryResponse.trim()) {
			// Fallback if LLM fails to generate a good summary
			summaryResponse = `Okay, I have ${txns.length} transaction(s) recorded so far. Ready to add more or finalize?`;
		}
	} catch (err) {
		console.error('[generateSummary] LLM error:', err);
		summaryResponse = `Sorry, I encountered an error generating the summary. We currently have ${txns.length} transaction(s) recorded.`;
		conversationStatus.set('Error');
	} finally {
		safeAddAssistantMessage(summaryResponse);
		conversationStatus.set(get(conversationStatus) === 'Error' ? 'Error' : ''); // Keep error status
		isProcessing.set(false);
	}
}
