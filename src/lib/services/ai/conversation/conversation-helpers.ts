// src/lib/services/ai/conversation/conversation-helpers.ts

// --- Keep only PURE utility functions here ---

import { textLooksLikeTransaction } from '$lib/utils/helpers';
import { resolveAndFormatDate } from '$lib/utils/date';
import { BULK_DATA_THRESHOLD_LINES, BULK_DATA_THRESHOLD_LENGTH } from './constants';

/**
 * Formats a date string for display in a human-readable format.
 * (This function is pure and can stay)
 */
export function formatDateForDisplay(dateStr: string): string {
	if (!dateStr || dateStr === 'unknown') return 'an unknown date';

	try {
		// Use chrono-node via resolveAndFormatDate first for better parsing
		const resolvedDate = resolveAndFormatDate(dateStr); // This returns YYYY-MM-DD or original/unknown
		if (resolvedDate !== 'unknown' && /\d{4}-\d{2}-\d{2}/.test(resolvedDate)) {
			// Add time T00:00:00 to avoid timezone issues when creating Date object
			const d = new Date(resolvedDate + 'T00:00:00');
			if (!isNaN(d.getTime())) {
				return d.toLocaleDateString('en-US', {
					weekday: 'long',
					year: 'numeric',
					month: 'long',
					day: 'numeric',
					timeZone: 'UTC' // Specify UTC to match the T00:00:00
				});
			}
		}
		// Fallback for original formats if resolve failed but Date() can parse it
		const d = new Date(dateStr);
		if (!isNaN(d.getTime())) {
			return d.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		}

		return dateStr; // Return original if all parsing fails
	} catch (e) {
		console.warn(`[formatDateForDisplay] Error parsing date "${dateStr}":`, e);
		return dateStr; // Return original on error
	}
}

/**
 * Checks if user input appears to be bulk data.
 * (This function is pure and can stay)
 */
export function isBulkData(message: string): boolean {
	const messageLines = message.split('\n').length;
	const messageLength = message.length;

	// Check if text looks like transactions AND exceeds length/line thresholds
	return (
		(messageLines > BULK_DATA_THRESHOLD_LINES || messageLength > BULK_DATA_THRESHOLD_LENGTH) &&
		textLooksLikeTransaction(message) // Use helper to check content pattern
	);
}

// --- Removed Functions ---
// safeAddAssistantMessage, startProcessing, finishProcessing, handleProcessingError, processInitialData
// were removed because they directly modified state and belong in conversationService.ts
// or should interact via conversationStore methods passed as arguments (less ideal).
