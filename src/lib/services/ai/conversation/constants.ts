// src/lib/services/ai/conversation/constants.ts

/**
 * Regular expressions and constants used in conversation handling
 */

// Regex patterns for detecting user states and conversation context
export const FRUSTRATED_REGEX = /\b(mad|angry|annoyed|upset|pissed|frustrated|stupid|wrong)\b/i;
export const CHATTY_REGEX = /(\bstory\b|\btesting\b|\bjust chat\b|\bjust saying\b)/i;
export const DESCRIPTION_QUESTION_REGEX = /what was it for|description\?/i;
export const DATE_QUESTION_REGEX = /what date|when did this happen/i;
export const AMOUNT_QUESTION_REGEX = /amount|how much/i;
export const CORRECTION_REGEX =
	/correction:|corrected date|updated:|changed to|actually was|is now|i've updated|i'll record the transaction with a date correction/i;

// Thresholds and limits
export const BULK_DATA_THRESHOLD_LINES = 10;
export const BULK_DATA_THRESHOLD_LENGTH = 500;
