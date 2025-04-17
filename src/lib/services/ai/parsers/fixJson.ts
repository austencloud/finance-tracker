// src/lib/services/ai/helpers.ts

/**
 * Attempts to salvage almost‑JSON coming from the LLM.
 *  – trims leading/trailing junk
 *  – removes dangling commas before `}` or `]`
 *  – returns the first valid JSON substring or null
 */
