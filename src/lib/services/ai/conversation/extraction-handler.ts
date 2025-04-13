// src/lib/services/ai/conversation/extraction-handler.ts (MODIFIED)
// --------------------------------------
import { get } from 'svelte/store';
import { extractTransactionsFromText } from '../extraction';
import { extractedTransactions } from '../store'; // <-- CHANGE HERE
import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { formatDateForDisplay } from './helpers';

/**
 * Extracts new transactions from the message
 */
export async function extractNewTransaction(
	message: string
): Promise<{ handled: boolean; response: string }> {
	if (!textLooksLikeTransaction(message)) {
		return { handled: false, response: '' };
	}

	console.log('[sendUserMessage] Attempting extraction to add new single entry...');

	try {
		const newTxns = await extractTransactionsFromText(message);
		if (newTxns.length === 0) {
			return {
				handled: true,
				response:
					"I saw something that might be a transaction, but couldn't extract details. Could you clarify?"
			};
		}

		extractedTransactions.update((txns) => [...txns, ...newTxns]);

		const { amount, description, date } = newTxns[0];
		const amtNum = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;

		return {
			handled: true,
			response: `I've recorded $${amtNum.toFixed(2)} ${description !== 'unknown' ? `for "${description}" ` : ''} on ${formatDateForDisplay(date)}. Anything else to add?`
		};
	} catch (err) {
		console.error('[sendUserMessage] Extraction error for new transaction:', err);
		return { handled: true, response: 'I had trouble extracting details. Could you try again?' };
	}
}
