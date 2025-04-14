// src/lib/services/ai/conversation/correction-handler.ts
import { get } from 'svelte/store';
import { extractedTransactions } from '../conversation';
import { CORRECTION_REGEX } from './constants';
import { extractTransactionsFromText } from '../extraction/orchestrator';

/**
 * Processes possible transaction corrections based on the assistant's response
 */
export async function handleCorrection(
	assistantResponse: string
): Promise<{ applied: boolean; updatedResponse: string }> {
	const currentTxns = get(extractedTransactions);

	if (currentTxns.length === 0 || !CORRECTION_REGEX.test(assistantResponse)) {
		return { applied: false, updatedResponse: assistantResponse };
	}

	console.log('[sendUserMessage] Assistant response suggests a correction. Attempting update...');

	try {
		const correctedTxns = await extractTransactionsFromText(assistantResponse);
		if (correctedTxns.length !== 1) {
			console.log(
				'[sendUserMessage] Correction: Could not extract single transaction from assistant response.'
			);
			return { applied: false, updatedResponse: assistantResponse };
		}

		const correctedData = correctedTxns[0];
		const lastTxnId = currentTxns[currentTxns.length - 1].id;
		let correctionApplied = false;

		extractedTransactions.update((txns) => {
			const indexToUpdate = txns.findIndex((t) => t.id === lastTxnId);
			if (indexToUpdate === -1) {
				console.warn(`[sendUserMessage] Correction: Couldn't find transaction ID ${lastTxnId}.`);
				return txns;
			}

			const originalTxn = txns[indexToUpdate];
			txns[indexToUpdate] = {
				...originalTxn,
				id: lastTxnId,
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
				notes: originalTxn.notes,
				category: originalTxn.category
			};

			correctionApplied = true;
			console.log(`[sendUserMessage] Updated transaction ID ${lastTxnId} via correction.`);
			return [...txns];
		});

		return { applied: correctionApplied, updatedResponse: assistantResponse };
	} catch (err) {
		console.error('[sendUserMessage] Error during correction attempt:', err);
		return { applied: false, updatedResponse: assistantResponse };
	}
}
