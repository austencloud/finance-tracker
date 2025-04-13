// src/lib/services/ai/conversation/mood-handler.ts
import { get } from 'svelte/store';
import { userMood } from '../conversation';
import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { FRUSTRATED_REGEX, CHATTY_REGEX } from './constants';

/**
 * Handles user mood detection and responds accordingly
 */
export function handleUserMood(message: string): { handled: boolean; response: string } {
	let currentMood = get(userMood);
	let response = '';
	let handled = false;

	if (FRUSTRATED_REGEX.test(message)) {
		currentMood = 'frustrated';
		userMood.set(currentMood);
		console.log('[sendUserMessage] Detected user frustration.');
		response =
			'I apologize if I made a mistake or caused frustration. How can I correct it or help better?';
		handled = true;
	} else if (CHATTY_REGEX.test(message)) {
		currentMood = 'chatty';
		userMood.set(currentMood);
		console.log('[sendUserMessage] Detected chatty mood.');
		response = 'Okay, just chatting! Let me know when you have transaction details.';
		handled = true;
	} else if (currentMood !== 'neutral' && !textLooksLikeTransaction(message)) {
		userMood.set('neutral');
	}

	return { handled, response };
}
