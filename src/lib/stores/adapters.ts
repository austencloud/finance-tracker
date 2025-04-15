// src/lib/stores/adapters.ts
import { writable, type Readable } from 'svelte/store';
import { appStore } from './AppStore';
import type { Category, Transaction } from './types';

// Instead of fancy derived stores, we'll just provide direct proxy properties
// Components subscribing to these will get notifications when the main store changes
export const transactions = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.transactions));
	}
};

export const loading = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.ui.loading));
	}
};

export const showSuccessMessage = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.ui.showSuccessMessage));
	}
};

export const selectedTransaction = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.ui.selectedTransaction));
	}
};

export const showTransactionDetails = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.ui.showTransactionDetails));
	}
};

export const currentCategory = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.ui.currentCategory));
	}
};

export const filterCategory = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.filters.category));
	}
};

export const searchTerm = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.filters.searchTerm));
	}
};

export const sortField = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.filters.sortField));
	}
};

export const sortDirection = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => callback(state.filters.sortDirection));
	}
};

export const sortedTransactions = {
	subscribe: (callback: any) => {
		return appStore.subscribe((state) => {
			// Just recalculate the sorted transactions right here
			const { transactions, filters } = state;

			// Do the filtering
			let filtered =
				filters.category === 'all'
					? transactions
					: transactions.filter((t) => t.category === filters.category);

			if (filters.searchTerm) {
				const term = filters.searchTerm.toLowerCase();
				filtered = filtered.filter(
					(t) => t.description.toLowerCase().includes(term) || t.date.toLowerCase().includes(term)
				);
			}

			// Do the sorting
			const sorted = [...filtered].sort((a, b) => {
				let valueA: any, valueB: any;

				if (filters.sortField === 'amount') {
					valueA = parseFloat(a.amount.toString().replace(/[$,]/g, ''));
					valueB = parseFloat(b.amount.toString().replace(/[$,]/g, ''));
				} else if (filters.sortField === 'date') {
					// Date logic...
					// (copy from the other implementation)
				} else {
					valueA = a[filters.sortField];
					valueB = b[filters.sortField];
				}

				if (valueA < valueB) return filters.sortDirection === 'asc' ? -1 : 1;
				if (valueA > valueB) return filters.sortDirection === 'asc' ? 1 : -1;
				return 0;
			});

			callback(sorted);
		});
	}
};

// Just forward all the action methods to appStore
export const addTransactions = (newTransactions: Transaction[]) =>
	appStore.addTransactions(newTransactions);

export const clearTransactions = () => appStore.clearTransactions();

export const deleteTransaction = (id: string) => appStore.deleteTransaction(id);

export const updateTransaction = (updatedTransaction: Transaction) =>
	appStore.updateTransaction(updatedTransaction);

export const assignCategory = (transaction: Transaction, category: Category) =>
	appStore.assignCategory(transaction, category);

export const addNotes = (transaction: Transaction, notes: string) =>
	appStore.addNotes(transaction, notes);

export const toggleSort = (field: 'date' | 'amount' | 'description' | 'category') =>
	appStore.toggleSort(field);
