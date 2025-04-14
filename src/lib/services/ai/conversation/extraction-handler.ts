// src/lib/services/ai/conversation/extraction-handler.ts
import { get } from 'svelte/store';
import { extractedTransactions } from '../store';
import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { formatDateForDisplay } from './conversation-helpers';
import { extractTransactionsFromText } from '../extraction/orchestrator';

/**
 * Extracts new transactions from the message
 * Enhanced to handle multiple transactions in a single message
 */
export async function extractNewTransaction(
	message: string
): Promise<{ handled: boolean; response: string }> {
	if (!textLooksLikeTransaction(message)) {
		return { handled: false, response: '' };
	}

	console.log('[sendUserMessage] Attempting extraction to add transactions...');

	try {
		const newTxns = await extractTransactionsFromText(message);
		if (newTxns.length === 0) {
			return {
				handled: true,
				response:
					"I noticed something that might be transaction-related, but couldn't extract the details. Could you clarify with more specific information?"
			};
		}

		extractedTransactions.update((txns) => [...txns, ...newTxns]);

		// Generate a response based on the number of transactions extracted
		if (newTxns.length === 1) {
			const { amount, description, date } = newTxns[0];
			const amtNum = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;
			const direction = newTxns[0].direction === 'in' ? 'received' : 'spent';

			return {
				handled: true,
				response: `Got it! I've recorded $${amtNum.toFixed(2)} ${direction} ${description !== 'unknown' ? `for "${description}" ` : ''} on ${formatDateForDisplay(date)}. Anything else to add?`
			};
		} else {
			// Multiple transactions
			let response = `I've recorded ${newTxns.length} transactions:\n\n`;

			newTxns.forEach(
				(
					txn: { amount: string | number; direction: string; description: string; date: string },
					index: number
				) => {
					const amtNum =
						typeof txn.amount === 'string'
							? parseFloat(txn.amount.replace(/[$,]/g, ''))
							: txn.amount;
					const direction = txn.direction === 'in' ? 'received' : 'spent';

					response += `${index + 1}. $${amtNum.toFixed(2)} ${direction} ${txn.description !== 'unknown' ? `for "${txn.description}" ` : ''}on ${formatDateForDisplay(txn.date)}\n`;
				}
			);

			response += "\nAnything else you'd like to add?";
			return { handled: true, response };
		}
	} catch (err) {
		console.error('[sendUserMessage] Extraction error for transaction:', err);
		return {
			handled: true,
			response:
				'I encountered an error while processing your transactions. Could you try rephrasing or providing the information one transaction at a time?'
		};
	}
}
