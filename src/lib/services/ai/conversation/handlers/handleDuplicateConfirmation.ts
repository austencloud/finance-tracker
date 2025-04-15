// src/lib/services/ai/conversation/handlers/handleDuplicateConfirmation.ts
import { conversationStore } from '../conversationStore';
import { appStore } from '$lib/stores/AppStore'; // Import main app store
import { get } from 'svelte/store'; // get might not be needed if using internal state directly
import type { Transaction } from '$lib/stores/types';

/**
 * Handles user response ("yes" or "no") after being asked to confirm adding duplicate transactions.
 * This handler should run early in the pipeline to catch the confirmation response.
 *
 * @param message The user's input message (e.g., "yes", "no").
 * @returns An object indicating if the message was handled and an optional response.
 */
export async function handleDuplicateConfirmation(
    message: string
): Promise<{ handled: boolean; response?: string }> {

    // Access the internal state directly via the store's method
    const internalState = conversationStore._getInternalState();

    // Only handle if we are actually waiting for this specific confirmation
    if (!internalState.waitingForDuplicateConfirmation) {
        return { handled: false }; // Let other handlers process the message
    }

    const lowerMessage = message.toLowerCase().trim();
    const pendingTransactions = internalState.pendingDuplicateTransactions || [];

    // Check for affirmative response
    if (lowerMessage === 'yes' || lowerMessage === 'y' || lowerMessage === 'add them' || lowerMessage === 'add it' || lowerMessage === 'add again') {
        console.log('[DuplicateConfirmationHandler] User confirmed adding duplicates.');

        if (pendingTransactions.length > 0) {
            // Add the stored pending (duplicate) transactions to the main store
            appStore.addTransactions(pendingTransactions); // Use appStore action

            // Clear the confirmation state from conversationStore
            conversationStore._clearDuplicateConfirmation();
            // Clear the last input context that led to the duplicate prompt
            conversationStore._clearLastInputContext();

            // Provide confirmation to the user
            return {
                handled: true,
                response: `Okay, I've added the duplicate transaction${pendingTransactions.length > 1 ? 's' : ''} again. What's next?`
            };
        } else {
            // Safety check: Should not happen if state was set correctly
            console.warn('[DuplicateConfirmationHandler] Confirmation flag was set, but no pending transactions found.');
            conversationStore._clearDuplicateConfirmation(); // Clear state anyway
             return {
                 handled: true,
                 response: "Something went wrong, I didn't have the duplicates saved properly. Please try adding them again if needed."
             };
        }

    // Check for negative response
    } else if (lowerMessage === 'no' || lowerMessage === 'n' || lowerMessage === 'cancel' || lowerMessage === "don't add" || lowerMessage === 'do not add') {
        console.log('[DuplicateConfirmationHandler] User rejected adding duplicates.');

        // Just clear the confirmation state, don't add anything
        conversationStore._clearDuplicateConfirmation();
        // Clear the last input context that led to the duplicate prompt
        conversationStore._clearLastInputContext();

        return {
            handled: true,
            response: "Okay, I won't add the duplicates. Let me know what else I can help with."
        };

    } else {
        // Unclear response, re-prompt the user
        console.log('[DuplicateConfirmationHandler] Unclear response, re-prompting.');
        return {
            handled: true, // We handled it by re-prompting
            response: "Sorry, I need a clear 'yes' or 'no'. Should I add the duplicate transaction(s) again?"
        };
    }
}
