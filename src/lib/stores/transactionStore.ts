// src/lib/stores/transactionStore.ts
import { writable, get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import type { Transaction, Category } from '../types/types'; // Adjust path
import { analysisStore } from './analysisStore'; // Import analysis store to trigger runs
import { uiStore } from './uiStore'; // Import UI store to clear selection on delete
import { resolveAndFormatDate } from '$lib/utils/date';

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
			const newTxnsToAdd: Transaction[] = [];

			for (const t of txns) {
				const processedTxn = {
					...t,
					id: t.id || uuidv4(),
					currency: t.currency?.toUpperCase() || 'USD',
					date: resolveAndFormatDate(t.date) // Use resolver here too for consistency
				};

				// Check 1: Already added by ID in this batch or previously?
				if (
					!processedTxn.id ||
					existingIds.has(processedTxn.id) ||
					newTxnsToAdd.some((nt) => nt.id === processedTxn.id)
				) {
					continue;
				}

				// Check 2: Basic Duplicate Check (same date, description, amount, direction)
				const isPotentialDuplicate = currentTxns.some(
					(existing) =>
						existing.date === processedTxn.date &&
						existing.description.toLowerCase() === processedTxn.description.toLowerCase() &&
						existing.amount === processedTxn.amount &&
						existing.direction === processedTxn.direction
				);

				if (isPotentialDuplicate) {
					console.warn(
						`[TransactionStore] Skipping potential duplicate: ${processedTxn.description} on ${processedTxn.date}`
					);
					continue;
				}

				newTxnsToAdd.push(processedTxn);
			}

			if (newTxnsToAdd.length === 0) return currentTxns; // No new unique transactions

			showTemporarySuccessMessage();
			debounceAnalysis(() => analysisStore.run()); // Trigger analysis
			return [...currentTxns, ...newTxnsToAdd];
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
		update((currentTxns) => {
			const index = currentTxns.findIndex((t) => t.id === transactionId);
			if (index === -1) return currentTxns;
			const newTransactions = [...currentTxns];
			// Ensure category is valid if needed (could check against categoryStore)
			// FIX: Use the correct property 'categories' and assign as an array
			newTransactions[index] = { ...newTransactions[index], categories: [category] };
			debounceAnalysis(() => analysisStore.run());
			return newTransactions;
		});
	},

	addNotes: (transactionId: string, notes: string) => {
		update((currentTxns) => {
			const index = currentTxns.findIndex((t) => t.id === transactionId);
			if (index === -1) return currentTxns;
			const newTransactions = [...currentTxns];
			newTransactions[index] = { ...newTransactions[index], notes };
			// No analysis run needed for notes
			return newTransactions;
		});
	}
};

export const transactionStore = {
	subscribe,
	...transactionActions
};
