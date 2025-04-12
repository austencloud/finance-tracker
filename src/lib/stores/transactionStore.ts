// src/lib/stores/transactionStore.ts
import { writable, derived } from 'svelte/store';
import type { Transaction, Category, CategoryTotals } from '$lib/types';

// Define initial categories
export const categories: Category[] = [
	'PayPal Transfers',
	'Business Income - Austen Cloud Performance',
	'Crypto Sales',
	'Non-Taxable Research/Surveys',
	'Misc Work - Insect Asylum',
	'Remote Deposits',
	'Rent Payments Received (Non-Income)',
	'Expenses',
	'Other / Uncategorized'
];

// Main transaction store
export const transactions = writable<Transaction[]>([]);

// UI state related to transactions
export const selectedTransaction = writable<Transaction | null>(null);
export const showTransactionDetails = writable(false);
export const currentCategory = writable<Category>(categories[0]);

// Calculate category totals based on transactions
export const categoryTotals = derived(transactions, ($transactions) => {
	const totals: CategoryTotals = {};

	// Initialize all categories with zero
	categories.forEach((cat) => {
		totals[cat] = 0;
	});

	// Sum up amounts for each category
	$transactions.forEach((txn) => {
		if (txn.category) {
			// Convert amount to number, removing $ and commas
			const amount = parseFloat(txn.amount.toString().replace(/[$,]/g, '')) || 0;

			// For expenses, store as negative
			const adjustedAmount = txn.category === 'Expenses' ? -Math.abs(amount) : Math.abs(amount);

			totals[txn.category] += adjustedAmount;
		}
	});

	return totals;
});

// Actions for transactions
export function addTransactions(newTransactions: Transaction[]): void {
	transactions.update((txns) => [...txns, ...newTransactions]);
	showTemporaryMessage();
}

export function clearTransactions(): void {
	if (confirm('Are you sure you want to clear all transactions? This cannot be undone.')) {
		transactions.set([]);
	}
}

export function deleteTransaction(id: number): void {
	transactions.update((txns) => txns.filter((t) => t.id !== id));
}

export function updateTransaction(updatedTransaction: Transaction): void {
	transactions.update((txns) => {
		const index = txns.findIndex((t) => t.id === updatedTransaction.id);
		if (index !== -1) {
			txns[index] = updatedTransaction;
		}
		return [...txns]; // Create new array to trigger reactivity
	});
}

export function assignCategory(transaction: Transaction, category: Category): void {
	transactions.update((txns) => {
		const index = txns.findIndex((t) => t.id === transaction.id);
		if (index !== -1) {
			txns[index].category = category;
		}
		return [...txns]; // Create new array to trigger reactivity
	});
}

export function addNotes(transaction: Transaction, notes: string): void {
	transactions.update((txns) => {
		const index = txns.findIndex((t) => t.id === transaction.id);
		if (index !== -1) {
			txns[index].notes = notes;
		}
		return [...txns]; // Create new array to trigger reactivity
	});
}

// Show temporary success message function is referenced but defined in uiStore
import { showSuccessMessage } from './uiStore';

function showTemporaryMessage(): void {
	showSuccessMessage.set(true);
	setTimeout(() => showSuccessMessage.set(false), 3000);
}
