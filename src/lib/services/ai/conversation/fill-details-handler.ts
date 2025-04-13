// src/lib/services/ai/conversation/fill-details-handler.ts
import { get } from 'svelte/store';
import type { Transaction } from '$lib/types';
import { resolveAndFormatDate } from '$lib/utils/date';
import { parseCurrency } from '$lib/utils/currency';
import { conversationMessages, extractedTransactions } from '../conversation';
import { formatDateForDisplay } from './helpers';
import {
	DESCRIPTION_QUESTION_REGEX,
	DATE_QUESTION_REGEX,
	AMOUNT_QUESTION_REGEX
} from './constants';

/**
 * Attempts to fill in missing details for an existing transaction
 */
export function fillMissingDetails(message: string): { handled: boolean; response: string } {
	const currentTxns = get(extractedTransactions);
	const messages = get(conversationMessages);

	if (currentTxns.length === 0 || messages.length < 2) {
		return { handled: false, response: '' };
	}

	const lastTxn = currentTxns[currentTxns.length - 1];
	const lastAssistantMessage = messages[messages.length - 2]?.content ?? '';

	// Determine which field might need updating
	let fieldToUpdate: keyof Transaction | null = null;
	let valueToUpdate: string | number | undefined = undefined;

	if (lastTxn.description === 'unknown' && DESCRIPTION_QUESTION_REGEX.test(lastAssistantMessage)) {
		fieldToUpdate = 'description';
		valueToUpdate = message.trim();
	} else if (lastTxn.date === 'unknown' && DATE_QUESTION_REGEX.test(lastAssistantMessage)) {
		fieldToUpdate = 'date';
		valueToUpdate = resolveAndFormatDate(message.trim());
		if (valueToUpdate === 'unknown') valueToUpdate = undefined;
	} else if (lastTxn.amount === 0 && AMOUNT_QUESTION_REGEX.test(lastAssistantMessage)) {
		fieldToUpdate = 'amount';
		valueToUpdate = parseCurrency(message.trim());
		if (isNaN(valueToUpdate as number) || valueToUpdate === 0) valueToUpdate = undefined;
	}

	if (!fieldToUpdate || valueToUpdate === undefined) {
		return { handled: false, response: '' };
	}

	// Update the transaction with the new information
	console.log(`[sendUserMessage] Filling in details for field: ${fieldToUpdate}`);
	const lastTxnId = lastTxn.id;
	let detailsFilled = false;

	extractedTransactions.update((txns) => {
		const indexToUpdate = txns.findIndex((t) => t.id === lastTxnId);
		if (indexToUpdate !== -1) {
			(txns[indexToUpdate] as any)[fieldToUpdate] = valueToUpdate;
			detailsFilled = true;
			console.log(
				`[sendUserMessage] Updated field '${fieldToUpdate}' for transaction [ID: ${lastTxnId}]`
			);
		}
		return [...txns];
	});

	if (!detailsFilled) {
		return { handled: false, response: '' };
	}

	// Generate confirmation response
	const updatedTxn = get(extractedTransactions).find((t) => t.id === lastTxnId);
	if (!updatedTxn) {
		return { handled: true, response: `Updated the ${fieldToUpdate}. Anything else?` };
	}

	const amtNum =
		typeof updatedTxn.amount === 'string'
			? parseFloat(updatedTxn.amount.replace(/[$,]/g, ''))
			: updatedTxn.amount;

	const isComplete =
		updatedTxn.description !== 'unknown' &&
		updatedTxn.date !== 'unknown' &&
		amtNum !== 0 &&
		updatedTxn.direction !== 'unknown';

	if (isComplete) {
		return {
			handled: true,
			response: `Okay, recorded $${amtNum.toFixed(2)} for "${updatedTxn.description}" on ${formatDateForDisplay(updatedTxn.date)}. Anything else?`
		};
	}

	// Transaction still incomplete, ask for the next missing detail
	let nextQuestion = 'Anything else to add?';
	if (updatedTxn.description === 'unknown') nextQuestion = 'What was this transaction for?';
	else if (updatedTxn.date === 'unknown') nextQuestion = 'What date did this happen?';
	else if (updatedTxn.amount === 0) nextQuestion = 'What was the amount?';

	return { handled: true, response: `Got it ("${message}"). ${nextQuestion}` };
}
