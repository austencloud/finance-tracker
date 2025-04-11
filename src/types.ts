// src/types.ts
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

export interface Transaction {
	id: number;
	date: string;
	description: string;
	type: string;
	amount: string | number;
	category: Category;
	notes: string;
	direction: 'in' | 'out' | 'unknown'; 
}

export interface CategoryTotals {
	[key: string]: number;
}

export type FilterCategory = 'all' | Category;

export type SortDirection = 'asc' | 'desc';

export type SortField = keyof Transaction;
