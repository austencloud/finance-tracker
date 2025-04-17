// src/lib/services/ai/conversation/handlers/handleCorrection.ts

import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { appStore } from '$lib/stores/AppStore';
import type { Transaction } from '$lib/types/types';
import { getSystemPrompt } from '../../prompts';
import { getLLMFallbackResponse, llmChat } from '../../llm-helpers';

export async function handleCorrection(
	message: string,
	explicitDirectionIntent: 'in' | 'out' | null
): Promise<{ handled: boolean; response?: string }> {
	// 🚨 If the user’s message doesn’t include any correction keywords, bail out
	const correctionKw = /\b(actually|meant|instead|rather|sorry|correct|just kidding)\b/i;
	if (!correctionKw.test(message)) {
		return { handled: false };
	}

	const internal = get(appStore).conversation._internal;
	const batchId = internal.lastExtractionBatchId;
	let txnId = internal.lastCorrectionTxnId;

	// If we haven’t picked a txn yet but there’s exactly one in the batch, use that
	if (!txnId && batchId) {
		const txns = get(appStore).transactions.filter((t) => t.batchId === batchId);
		if (txns.length === 1) {
			txnId = txns[0].id;
		}
	}
	if (!txnId) {
		return { handled: false };
	}

	appStore.setConversationStatus('Applying your correction…', 30);

	try {
		const today = new Date().toISOString().slice(0, 10);
		const sys = getSystemPrompt(today);

		const txn = get(appStore).transactions.find((t) => t.id === txnId)!;

		const prompt = `
You previously recorded this transaction:
{
  "id": "${txn.id}",
  "date": "${txn.date}",
  "description": "${txn.description}",
  "amount": ${txn.amount},
  "type": "${txn.type}",
  "direction": "${txn.direction}",
  "category": "${txn.category}",
  "notes": "${txn.notes}"
}

The user now says: "${message}"

Identify exactly which field(s) they want to update and their new value.
Return ONLY this JSON object—no prose:

\`\`\`json
{
  "id": "<same id>",
  "field_updates": {
    // e.g. "amount": 750, "description": "New Desc"
  }
}
\`\`\`
`.trim();

		const aiResp = await llmChat(
			[
				{ role: 'system', content: sys },
				{ role: 'user', content: prompt }
			],
			{ temperature: 0.2, rawUserText: message, requestJsonFormat: true }
		);

		// strip fences & parse
		const cleaned = aiResp.trim().replace(/^```json\s*|```$/g, '');
		const { id, field_updates } = JSON.parse(cleaned);

		if (!id || typeof field_updates !== 'object') {
			throw new Error('Invalid correction response');
		}

		// override direction if explicitly provided
		if (explicitDirectionIntent) {
			field_updates.direction = explicitDirectionIntent;
		}

		// apply the update
		const updatedTxn: Transaction = { ...txn, ...field_updates };
		appStore.updateTransaction(updatedTxn);
		appStore.setConversationStatus('Transaction updated', 100);

		// keep this txn in context for further corrections
		appStore._setConversationInternalState({
			lastCorrectionTxnId: id
			// leave lastExtractionBatchId intact so we can chain more corrections
		});

		const updates = Object.entries(field_updates)
			.map(([k, v]) => `${k}: ${v}`)
			.join(', ');

		return {
			handled: true,
			response: `✅ Updated ${txn.description} (${updates}). Anything else?`
		};
	} catch (err) {
		console.error('[CorrectionHandler] error:', err);
		appStore.setConversationStatus('Error applying correction');
		// clear context to avoid loops
		appStore._setConversationInternalState({
			lastExtractionBatchId: null,
			lastCorrectionTxnId: null
		});
		return {
			handled: true,
			response: getLLMFallbackResponse(err instanceof Error ? err : undefined)
		};
	}
}
