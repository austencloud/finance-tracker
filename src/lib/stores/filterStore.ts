// src/lib/stores/filterStore.ts
import { writable, derived } from 'svelte/store';
import type { FilterCategory, SortField, SortDirection } from '$lib/types';
import { transactions } from './transactionStore';

// Filter and sort state
export const filterCategory = writable<FilterCategory>('all');
export const searchTerm = writable('');
export const sortField = writable<SortField>('date');
export const sortDirection = writable<SortDirection>('desc');

// Filter transactions based on category and search term
export const filteredTransactions = derived(
	[transactions, filterCategory, searchTerm],
	([$transactions, $filterCategory, $searchTerm]) => {
		return $transactions.filter((txn) => {
			// Category filter
			const categoryMatch = $filterCategory === 'all' || txn.category === $filterCategory;

			// Search filter
			const searchMatch =
				$searchTerm === '' ||
				txn.description.toLowerCase().includes($searchTerm.toLowerCase()) ||
				txn.date.toLowerCase().includes($searchTerm.toLowerCase());

			return categoryMatch && searchMatch;
		});
	}
);

// Sort filtered transactions
export const sortedTransactions = derived(
	[filteredTransactions, sortField, sortDirection],
	([$filteredTransactions, $sortField, $sortDirection]) => {
		return [...$filteredTransactions].sort((a, b) => {
			let valueA: any, valueB: any;

			if ($sortField === 'amount') {
				valueA = parseFloat(a.amount.toString().replace(/[$,]/g, ''));
				valueB = parseFloat(b.amount.toString().replace(/[$,]/g, ''));
			} else if ($sortField === 'date') {
				// Try to parse dates in various formats
				try {
					valueA = new Date(a.date);
					valueB = new Date(b.date);

					// If the date is invalid, fall back to string comparison
					if (isNaN(valueA.getTime()) || isNaN(valueB.getTime())) {
						valueA = a.date;
						valueB = b.date;
					}
				} catch (e) {
					valueA = a.date;
					valueB = b.date;
				}
			} else {
				valueA = a[$sortField];
				valueB = b[$sortField];
			}

			// Compare the values
			if (valueA < valueB) return $sortDirection === 'asc' ? -1 : 1;
			if (valueA > valueB) return $sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	}
);

// Toggle sort direction
export function toggleSort(field: SortField): void {
	sortField.update((currentField) => {
		if (currentField === field) {
			sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
		} else {
			sortDirection.set('asc');
		}
		return field;
	});
}
