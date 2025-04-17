// src/lib/stores/filterStore.ts
import { writable } from 'svelte/store';
import type { FilterState, Category, SortField } from '../types/types'; // Adjust path

const initialState: FilterState = {
	category: 'all',
	searchTerm: '',
	sortField: 'date',
	sortDirection: 'desc'
};

const { subscribe, update, set } = writable<FilterState>(initialState);

export const filterStore = {
	subscribe,
	setCategory: (category: 'all' | Category) => {
		update((s) => ({ ...s, category }));
	},
	setSearchTerm: (term: string) => {
		update((s) => ({ ...s, searchTerm: term.trim() })); // Trim search term
	},
	toggleSort: (field: SortField) => {
		update((s) => {
			const currentField = s.sortField;
			const currentDirection = s.sortDirection;
			// If sorting by new field, default to descending, otherwise toggle
			const newDirection = currentField === field
                ? (currentDirection === 'asc' ? 'desc' : 'asc')
                : 'desc';
			return { ...s, sortField: field, sortDirection: newDirection };
		});
	},
	reset: () => {
		set(initialState);
	}
};
