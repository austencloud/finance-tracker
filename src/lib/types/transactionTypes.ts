// src/lib/types/transaction.ts
export type Category =
	| 'PayPal Transfers'
	| 'Business Income - Austen Cloud Performance'
	| 'Crypto Sales'
	| 'Non-Taxable Research/Surveys'
	| 'Misc Work - Insect Asylum'
	| 'Remote Deposits'
	| 'Rent Payments Received (Non-Income)'
	| 'Expenses'
	| 'Other / Uncategorized';

// Base type matching Zod schema structure
export interface Transaction {
	id: string; // UUID v4 - Ensure this is consistently string
	date: string; // Format: YYYY-MM-DD or "unknown"
	description: string; // "unknown" if not provided
	type: string; // Best guess or "unknown"
	amount: number; // Always positive number, 0 if unknown
	category: Category;
	notes: string; // Default empty string
	direction: 'in' | 'out' | 'unknown'; // Explicit direction
}

// Keep other related types
export interface CategoryTotals {
	[key: string]: number;
}
export type FilterCategory = 'all' | Category;
export type SortDirection = 'asc' | 'desc';
export type SortField =
	| keyof Omit<Transaction, 'id' | 'notes'>
	| 'amount'
	| 'date'
	| 'description'
	| 'category'; // Refine sortable fields if needed
