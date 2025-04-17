// src/lib/stores/derivedStores.ts
import { derived } from 'svelte/store';
import { transactionStore } from './transactionStore';
import { filterStore } from './filterStore';
import type { Transaction, FilterState } from '../types/types'; // Adjust path

/**
 * Derived store that automatically updates when transactions or filters change.
 * Returns a sorted and filtered list of transactions.
 */
export const sortedFilteredTransactions = derived<
	[typeof transactionStore, typeof filterStore],
	Transaction[]
>([transactionStore, filterStore], ([$transactions, $filters]) => {
	console.log('[Derived] Recalculating sortedFilteredTransactions...'); // Debug log

	// Filtering logic
	let filtered = $transactions;
	if ($filters.category !== 'all') {
		filtered = $transactions.filter((t) => t.category === $filters.category);
	}
	if ($filters.searchTerm) {
		const term = $filters.searchTerm.toLowerCase();
		filtered = filtered.filter(
			(t) =>
				(t.description || '').toLowerCase().includes(term) ||
				(t.date || '').toLowerCase().includes(term) ||
				(t.notes || '').toLowerCase().includes(term) ||
				(t.category || '').toLowerCase().includes(term) ||
				(t.type || '').toLowerCase().includes(term) ||
				(t.currency || '').toLowerCase().includes(term) ||
				(t.amount?.toString() ?? '').includes(term)
		);
	}

	// Sorting logic
	return [...filtered].sort((a, b) => {
		let valueA: any, valueB: any;
		switch ($filters.sortField) {
			case 'amount':
				valueA = a.amount ?? 0;
				valueB = b.amount ?? 0;
				break;
			case 'date':
				const dateA = a.date === 'unknown' ? 0 : new Date(a.date).getTime();
				const dateB = b.date === 'unknown' ? 0 : new Date(b.date).getTime();
				valueA = isNaN(dateA) ? ($filters.sortDirection === 'asc' ? Infinity : -Infinity) : dateA;
				valueB = isNaN(dateB) ? ($filters.sortDirection === 'asc' ? Infinity : -Infinity) : dateB;
				break;
			case 'description':
				valueA = (a.description || '').toLowerCase();
				valueB = (b.description || '').toLowerCase();
				break;
			case 'category':
				valueA = (a.category || '').toLowerCase();
				valueB = (b.category || '').toLowerCase();
				break;
			default:
				return 0;
		}
		const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
		return $filters.sortDirection === 'asc' ? comparison : -comparison;
	});
});
