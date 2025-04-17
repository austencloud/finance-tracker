// src/lib/stores/transactionStore.ts
import { writable, get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import type { Transaction, Category } from '../types/types'; // Adjust path
import { analysisStore } from './analysisStore'; // Import analysis store to trigger runs
import { uiStore } from './uiStore'; // Import UI store to clear selection on delete

// Debounce helper (can be moved to utils)
let analysisTimeout: ReturnType<typeof setTimeout> | null = null;
const ANALYSIS_DEBOUNCE_MS = 500;
function debounceAnalysis(run: () => void) {
	if (analysisTimeout) clearTimeout(analysisTimeout);
	analysisTimeout = setTimeout(run, ANALYSIS_DEBOUNCE_MS);
}

// Helper for temporary success messages (could be moved to uiStore)
function showTemporarySuccessMessage(duration = 2000) {
    uiStore.showSuccessMessage(true);
	setTimeout(() => {
        uiStore.showSuccessMessage(false);
	}, duration);
}


// --- Store Definition ---
const initialTransactions: Transaction[] = [];
const { subscribe, update, set } = writable<Transaction[]>(initialTransactions);

// --- Store Actions ---
const transactionActions = {
	add: (txns: Transaction[]) => {
		if (!txns || txns.length === 0) return;
		update((currentTxns) => {
			const existingIds = new Set(currentTxns.map((t) => t.id));
			const processedTxns = txns
				.map((t) => ({
					...t,
					id: t.id || uuidv4(),
					currency: t.currency?.toUpperCase() || 'USD', // Default currency
                    date: t.date || 'unknown' // Ensure date exists
				}))
				.filter((t) => t.id && !existingIds.has(t.id)); // Filter out duplicates by ID

			if (processedTxns.length === 0) return currentTxns; // No new unique transactions

			showTemporarySuccessMessage();
			debounceAnalysis(() => analysisStore.run()); // Trigger analysis
			return [...currentTxns, ...processedTxns];
		});
	},

	clear: () => {
		if (!confirm('Are you sure you want to clear all transactions? This cannot be undone.')) return;
		set([]); // Reset to empty array
		analysisStore.run(); // Re-run analysis
	},

	deleteById: (id: string) => {
		update((currentTxns) => {
			const initialLength = currentTxns.length;
			const remainingTxns = currentTxns.filter((t) => t.id !== id);
			if (remainingTxns.length === initialLength) return currentTxns; // No change

			debounceAnalysis(() => analysisStore.run());
            // If the deleted transaction was selected, clear the selection in uiStore
            uiStore.clearSelectionIfMatches(id);
			return remainingTxns;
		});
	},

	update: (updatedTxn: Transaction) => {
		if (!updatedTxn || !updatedTxn.id) return;
		update((currentTxns) => {
			const index = currentTxns.findIndex((t) => t.id === updatedTxn.id);
			if (index === -1) return currentTxns; // Transaction not found

			const newTransactions = [...currentTxns];
			newTransactions[index] = { ...newTransactions[index], ...updatedTxn }; // Merge updates

			debounceAnalysis(() => analysisStore.run());
			return newTransactions;
		});
	},

	assignCategory: (transactionId: string, category: Category) => {
		update(currentTxns => {
			const index = currentTxns.findIndex((t) => t.id === transactionId);
			if (index === -1) return currentTxns;
			const newTransactions = [...currentTxns];
			// Ensure category is valid if needed (could check against categoryStore)
			newTransactions[index] = { ...newTransactions[index], category };
			debounceAnalysis(() => analysisStore.run());
			return newTransactions;
		});
	},

	addNotes: (transactionId: string, notes: string) => {
		update(currentTxns => {
			const index = currentTxns.findIndex((t) => t.id === transactionId);
			if (index === -1) return currentTxns;
			const newTransactions = [...currentTxns];
			newTransactions[index] = { ...newTransactions[index], notes };
			// No analysis run needed for notes
			return newTransactions;
		});
	},
};

export const transactionStore = {
	subscribe,
	...transactionActions
};
