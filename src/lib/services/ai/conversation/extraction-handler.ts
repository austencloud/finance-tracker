// src/lib/services/ai/conversation/extraction-handler.ts
import { get } from 'svelte/store';
import { extractedTransactions, setState } from '../store'; // Import setState
import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { formatDateForDisplay } from './conversation-helpers';
import { extractTransactionsFromText } from '../extraction/orchestrator';
import { formatCurrency } from '$lib/utils/currency';

/**
 * Extracts new transactions from the message. Stores the input message if successful.
 * Returns handled: true even if extraction fails but text looked like a transaction initially.
 */
export async function extractNewTransaction(
	message: string
): Promise<{ handled: boolean; response: string; extractedCount: number }> {
	if (!textLooksLikeTransaction(message)) {
		return { handled: false, response: '', extractedCount: 0 };
	}

	console.log('[extractNewTransaction] Attempting extraction to add transactions...');
	let extractedCount = 0;

	try {
		const newTxns = await extractTransactionsFromText(message);
		extractedCount = newTxns.length;

		if (extractedCount === 0) {
			console.log(
				'[extractNewTransaction] Text looked like transaction, but no details extracted.'
			);
			return {
				handled: true,
				response:
					"I noticed something that might be transaction-related, but couldn't extract the specific details. Could you please rephrase or provide more clarity (e.g., amount, date, description)?",
				extractedCount: 0
			};
		}

		// --- Store input text associated with these transactions ---
		const batchId = newTxns[0]?.id; // Use first txn ID as a pseudo batch ID, assuming UUID
		setState({
			lastInputTextForTransactions: message,
			lastTransactionBatchId: batchId ?? null // Store the input text
		});
		// --- End Store input text ---

		extractedTransactions.update((txns) => [...txns, ...newTxns]);
		console.log(`[extractNewTransaction] Added ${extractedCount} new transactions to the store.`);

		// --- Generate Confirmation Response ---
		let response = '';
		if (extractedCount === 1) {
			const txn = newTxns[0];
			const amtNum =
				typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/[$,]/g, '')) : txn.amount;
			const directionDisplay =
				txn.direction === 'in' ? 'received' : txn.direction === 'out' ? 'spent' : '(direction?)';
			response = `Got it! I've recorded ${formatCurrency(amtNum)} ${directionDisplay} ${txn.description !== 'unknown' ? `for "${txn.description}" ` : ''}${txn.date !== 'unknown' ? `on ${formatDateForDisplay(txn.date)}` : ''}. Anything else to add?`;
		} else {
			response = `Great! I've recorded ${extractedCount} transactions:\n\n`;
			const maxToList = 5;
			newTxns.slice(0, maxToList).forEach((txn, index) => {
				const amtNum =
					typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/[$,]/g, '')) : txn.amount;
				const directionDisplay =
					txn.direction === 'in' ? 'received' : txn.direction === 'out' ? 'spent' : '(direction?)';
				response += `${index + 1}. ${formatCurrency(amtNum)} ${directionDisplay} ${txn.description !== 'unknown' ? `for "${txn.description}" ` : ''}${txn.date !== 'unknown' ? `on ${formatDateForDisplay(txn.date)}` : ''}\n`;
			});
			if (extractedCount > maxToList) {
				response += `...and ${extractedCount - maxToList} more.\n`;
			}
			response += "\nAnything else you'd like to add?";
		}
		return { handled: true, response, extractedCount };
	} catch (err) {
		console.error('[extractNewTransaction] Extraction error:', err);
		return {
			handled: true,
			response:
				'I encountered an error while trying to process that as a transaction. Could you try rephrasing or providing the information one transaction at a time?',
			extractedCount: 0
		};
	}
}
