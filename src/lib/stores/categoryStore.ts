// src/lib/stores/categoryStore.ts
import { readable } from 'svelte/store';
import type { Category } from '../types/types'; // Adjust path if needed

const initialCategories: Category[] = [
	'PayPal Transfers',
	'Business Income - Austen Cloud Performance',
	'Crypto Sales',
	'Non-Taxable Research/Surveys',
	'Misc Work - Insect Asylum',
	'Remote Deposits',
	'Rent Payments Received (Non-Income)',
	'Expenses',
	'Other / Uncategorized'
    // Add more categories as needed
];

// Use a readable store as categories are likely static or loaded once
export const categories = readable<Category[]>(initialCategories);

// If you needed to add/remove categories dynamically, you'd use a writable store
// and export functions to modify it.
