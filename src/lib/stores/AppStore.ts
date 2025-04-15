// src/lib/stores/AppStore.ts
import { writable, type Writable } from 'svelte/store';
import type {
	AppState,
	UIState,
	FilterState,
	ConversationState,
	BulkProcessingState
} from './types';
import type { Transaction, Category } from '$lib/types/transactionTypes';
import { categories } from './transactionStore';

// Initial state - keeping this the same
const initialState: AppState = {
	transactions: [],
	ui: {
		loading: false,
		showSuccessMessage: false,
		selectedTransaction: null,
		showTransactionDetails: false,
		currentCategory: categories[0]
	},
	filters: {
		category: 'all',
		searchTerm: '',
		sortField: 'date',
		sortDirection: 'desc'
	},
	conversation: {
		messages: [],
		status: '',
		isProcessing: false,
		progress: 0,
		extractedTransactions: [],
		waitingForDirectionClarification: false,
		clarificationTxnIds: []
	},
	bulkProcessing: {
		processingChunks: [],
		processingProgress: 0,
		isBulkProcessing: false,
		tempExtractedTransactions: []
	}
};

// Create the main store
const appStateStore: Writable<AppState> = writable(initialState);

// Helper for temporary messages
function showTemporaryMessage() {
	appStateStore.update(state => ({
		...state,
		ui: { ...state.ui, showSuccessMessage: true }
	}));

	setTimeout(() => {
		appStateStore.update(state => ({
			...state,
			ui: { ...state.ui, showSuccessMessage: false }
		}));
	}, 3000);
}

// Export our store with all actions and computed values
export const appStore = {
	// Basic store subscription for components to react to changes
	subscribe: appStateStore.subscribe,
    
	// === COMPUTED VALUES ===
	// Instead of derived stores, we'll use functions that components can call
	getSortedTransactions: () => {
		// Get the current state
		let value: AppState | undefined;
		const unsubscribe = appStateStore.subscribe(state => {
			value = state;
		});
		unsubscribe();
		
		if (!value) return [];
		
		const { transactions, filters } = value;
		
		// Category filtering
		let filtered = filters.category === 'all' 
			? transactions 
			: transactions.filter(t => t.category === filters.category);
		
		// Search filtering
		if (filters.searchTerm) {
			const term = filters.searchTerm.toLowerCase();
			filtered = filtered.filter(t => 
				t.description.toLowerCase().includes(term) || 
				t.date.toLowerCase().includes(term)
			);
		}
		
		// Sorting
		return [...filtered].sort((a, b) => {
			let valueA: any, valueB: any;
			
			if (filters.sortField === 'amount') {
				valueA = parseFloat(a.amount.toString().replace(/[$,]/g, ''));
				valueB = parseFloat(b.amount.toString().replace(/[$,]/g, ''));
			} else if (filters.sortField === 'date') {
				try {
					valueA = new Date(a.date);
					valueB = new Date(b.date);
					
					if (isNaN(valueA.getTime()) || isNaN(valueB.getTime())) {
						valueA = a.date;
						valueB = b.date;
					}
				} catch {
					valueA = a.date;
					valueB = b.date;
				}
			} else {
				valueA = a[filters.sortField];
				valueB = b[filters.sortField];
			}
			
            if (valueA < valueB) return filters.sortDirection === 'asc' ? -1 : 1;
            if (valueA > valueB) return filters.sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	},
	
	getCategoryTotals: () => {
		// Get current transactions
		let transactions: Transaction[] = [];
		const unsubscribe = appStateStore.subscribe(state => {
			transactions = state.transactions;
		});
		unsubscribe();
		
		const totals: Record<string, number> = {};
		
		// Initialize categories with zero
		categories.forEach(cat => {
			totals[cat] = 0;
		});
		
		// Sum up amounts
		transactions.forEach(txn => {
			if (txn.category) {
				const amount = parseFloat(txn.amount.toString().replace(/[$,]/g, '')) || 0;
				const adjustedAmount = txn.category === 'Expenses' ? -Math.abs(amount) : Math.abs(amount);
				totals[txn.category] += adjustedAmount;
			}
		});
		
		return totals;
	},

	// === ACTION METHODS ===
	// Transaction actions
	addTransactions: (newTransactions: Transaction[]) => {
		appStateStore.update(state => ({
			...state,
			transactions: [...state.transactions, ...newTransactions]
		}));
		showTemporaryMessage();
	},

	clearTransactions: () => {
		if (confirm('Are you sure you want to clear all transactions? This cannot be undone.')) {
			appStateStore.update(state => ({ ...state, transactions: [] }));
		}
	},

	deleteTransaction: (id: string) => {
		appStateStore.update(state => ({
			...state,
			transactions: state.transactions.filter(t => t.id !== id)
		}));
	},

	updateTransaction: (updatedTransaction: Transaction) => {
		appStateStore.update(state => {
			const index = state.transactions.findIndex(t => t.id === updatedTransaction.id);
			if (index !== -1) {
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = updatedTransaction;
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
	},

	assignCategory: (transaction: Transaction, category: Category) => {
		appStateStore.update(state => {
			const index = state.transactions.findIndex(t => t.id === transaction.id);
			if (index !== -1) {
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = { ...updatedTransactions[index], category };
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
	},

	addNotes: (transaction: Transaction, notes: string) => {
		appStateStore.update(state => {
			const index = state.transactions.findIndex(t => t.id === transaction.id);
			if (index !== -1) {
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = { ...updatedTransactions[index], notes };
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
	},

	// UI actions
	setLoading: (loading: boolean) => {
		appStateStore.update(state => ({
			...state,
			ui: { ...state.ui, loading }
		}));
	},

	selectTransaction: (transaction: Transaction | null) => {
		appStateStore.update(state => ({
			...state,
			ui: {
				...state.ui,
				selectedTransaction: transaction,
				showTransactionDetails: transaction !== null
			}
		}));
	},

	toggleTransactionDetails: (show?: boolean) => {
		appStateStore.update(state => ({
			...state,
			ui: {
				...state.ui,
				showTransactionDetails: show !== undefined ? show : !state.ui.showTransactionDetails
			}
		}));
	},

	setCurrentCategory: (category: Category) => {
		appStateStore.update(state => ({
			...state,
			ui: { ...state.ui, currentCategory: category }
		}));
	},

	// Filter actions
	setFilterCategory: (category: 'all' | Category) => {
		appStateStore.update(state => ({
			...state,
			filters: { ...state.filters, category }
		}));
	},

	setSearchTerm: (searchTerm: string) => {
		appStateStore.update(state => ({
			...state,
			filters: { ...state.filters, searchTerm }
		}));
	},

	toggleSort: (field: 'date' | 'amount' | 'description' | 'category') => {
		appStateStore.update(state => {
			if (state.filters.sortField === field) {
				return {
					...state,
					filters: {
						...state.filters,
						sortDirection: state.filters.sortDirection === 'asc' ? 'desc' : 'asc'
					}
				};
			} else {
				return {
					...state,
					filters: {
						...state.filters,
						sortField: field,
						sortDirection: 'asc'
					}
				};
			}
		});
	}
};