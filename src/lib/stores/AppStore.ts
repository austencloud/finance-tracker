// src/lib/stores/AppStore.ts
import { writable, get, derived, type Writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import type {
	AppState,
	Transaction,
	Category,
	CategoryTotals,
	UIState,
	FilterState,
	SortField,
	ConversationState, // Import ConversationState
	ConversationMessage, // Import ConversationMessage
	BulkProcessingState, // Import BulkProcessingState
	ProcessingChunk, // Import ProcessingChunk
	ChunkStatus, // Import ChunkStatus
	UserMood // Import UserMood
} from './types'; // Make sure types.ts exports all these

// --- Initial State ---
// Define categories directly here or import from a config file
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
];

const initialConversationState: ConversationState = {
	messages: [
		{
			role: 'assistant',
			content:
				"Hello! I'm your AI Transaction Assistant. Paste your transaction data or describe your spending and I’ll help you organize it.",
			timestamp: Date.now()
		}
	],
	status: '',
	isProcessing: false,
	progress: 0,
	extractedTransactions: [],
	userMood: 'unknown',
	_internal: {
		initialPromptSent: false,
		waitingForDirectionClarification: false,
		clarificationTxnIds: [],
		lastUserMessageText: '',
		lastExtractionBatchId: null
	}
};

const initialBulkProcessingState: BulkProcessingState = {
	processingChunks: [],
	processingProgress: 0,
	isBulkProcessing: false,
	tempExtractedTransactions: []
};

const initialState: AppState = {
	transactions: [], // Main transactions list
	categories: initialCategories,
	ui: {
		loading: false,
		showSuccessMessage: false,
		selectedTransactionId: null,
		showTransactionDetails: false,
		currentCategory: initialCategories.includes('Expenses') ? 'Expenses' : initialCategories[0]
	},
	filters: {
		category: 'all',
		searchTerm: '',
		sortField: 'date',
		sortDirection: 'desc'
	},
	conversation: initialConversationState,
	bulkProcessing: initialBulkProcessingState
};

// --- The Central Store ---
const appStateStore: Writable<AppState> = writable(initialState);

// --- Helper for Temporary Messages ---
function showTemporarySuccessMessage(duration = 3000) {
	appStateStore.update((state) => ({
		...state,
		ui: { ...state.ui, showSuccessMessage: true }
	}));
	setTimeout(() => {
		appStateStore.update((state) => ({
			...state,
			ui: { ...state.ui, showSuccessMessage: false }
		}));
	}, duration);
}

// --- Exported Store Object ---
// We export an object containing the subscribe method and all actions/selectors
export const appStore = {
	// Provide read-only access to the store's value
	subscribe: appStateStore.subscribe,

	// === SELECTORS / COMPUTED VALUES ===
	// Use `get(appStateStore)` to read the current state inside these functions

	// Get a specific transaction by ID
	getTransactionById: (id: string | null): Transaction | null => {
		if (!id) return null;
		const state = get(appStateStore);
		return state.transactions.find((t) => t.id === id) || null;
	},

	// Get computed sorted and filtered transactions
	getSortedFilteredTransactions: (): Transaction[] => {
		const state = get(appStateStore);
		const { transactions, filters } = state;

		// Filtering logic
		let filtered =
			filters.category === 'all'
				? transactions
				: transactions.filter((t) => t.category === filters.category);

		if (filters.searchTerm) {
			const term = filters.searchTerm.toLowerCase();
			filtered = filtered.filter(
				(t) =>
					(t.description || '').toLowerCase().includes(term) ||
					(t.date || '').toLowerCase().includes(term) ||
					(t.notes || '').toLowerCase().includes(term) ||
					(t.category || '').toLowerCase().includes(term) ||
					(t.type || '').toLowerCase().includes(term)
			);
		}

		// Sorting logic
		return [...filtered].sort((a, b) => {
			let valueA: any, valueB: any;

			switch (filters.sortField) {
				case 'amount':
					valueA = a.amount; // Amount is already number
					valueB = b.amount;
					break;
				case 'date':
					// Robust date comparison
					try {
						const dateA = new Date(a.date).getTime();
						const dateB = new Date(b.date).getTime();
						// Handle invalid dates by treating them as minimal values or comparing strings
						valueA = isNaN(dateA) ? 0 : dateA;
						valueB = isNaN(dateB) ? 0 : dateB;
						if (isNaN(dateA) && isNaN(dateB)) {
							// If both invalid, compare original strings
							valueA = a.date;
							valueB = b.date;
						}
					} catch {
						valueA = a.date; // Fallback to string comparison on error
						valueB = b.date;
					}
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
					valueA = a[filters.sortField]; // Should not happen with TS
					valueB = b[filters.sortField];
			}

			// Comparison logic
			const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
			return filters.sortDirection === 'asc' ? comparison : -comparison;
		});
	},

	// Get computed category totals
	getCategoryTotals: (): CategoryTotals => {
		const state = get(appStateStore);
		const totals: CategoryTotals = {};

		// Initialize totals for all known categories
		state.categories.forEach((cat) => {
			totals[cat] = 0;
		});

		// Sum amounts from the main transactions list
		state.transactions.forEach((txn) => {
			if (txn.category && totals.hasOwnProperty(txn.category)) {
				const amount = txn.amount || 0; // Amount is number
				// Use direction for +/-
				const adjustedAmount = txn.direction === 'out' ? -Math.abs(amount) : Math.abs(amount);
				totals[txn.category] += adjustedAmount;
			} else if (txn.category) {
				// Handle case where a transaction has a category not in the initial list (optional)
				// console.warn(`Transaction category "${txn.category}" not in predefined list.`);
				// totals[txn.category] = (totals[txn.category] || 0) + (txn.direction === 'out' ? -Math.abs(amount) : Math.abs(amount));
			}
		});

		return totals;
	},

	// === ACTIONS (methods to modify state) ===

	// --- Transaction Actions ---
	addTransactions: (newTransactions: Transaction[]) => {
		if (!Array.isArray(newTransactions) || newTransactions.length === 0) return;
		appStateStore.update((state) => {
			// Optional: Add de-duplication logic here if needed
			const uniqueNewTransactions = newTransactions.filter(
				(newTxn) => !state.transactions.some((existingTxn) => existingTxn.id === newTxn.id)
			);
			return {
				...state,
				transactions: [...state.transactions, ...uniqueNewTransactions]
			};
		});
		if (newTransactions.length > 0) {
			showTemporarySuccessMessage();
		}
	},

	clearTransactions: () => {
		if (confirm('Are you sure you want to clear all transactions? This cannot be undone.')) {
			appStateStore.update((state) => ({ ...state, transactions: [] }));
		}
	},

	deleteTransaction: (id: string) => {
		appStateStore.update((state) => ({
			...state,
			transactions: state.transactions.filter((t) => t.id !== id),
			// Also ensure it's deselected if it was the selected one
			ui: {
				...state.ui,
				selectedTransactionId: state.ui.selectedTransactionId === id ? null : state.ui.selectedTransactionId,
				showTransactionDetails: state.ui.selectedTransactionId === id ? false : state.ui.showTransactionDetails
			}
		}));
	},

	updateTransaction: (updatedTransaction: Transaction) => {
		appStateStore.update((state) => {
			const index = state.transactions.findIndex((t) => t.id === updatedTransaction.id);
			if (index !== -1) {
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = updatedTransaction;
				return { ...state, transactions: updatedTransactions };
			}
			return state; // Return unchanged state if ID not found
		});
	},

	assignCategory: (transactionId: string, category: Category) => {
		appStateStore.update((state) => {
			const index = state.transactions.findIndex((t) => t.id === transactionId);
			if (index !== -1) {
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = { ...updatedTransactions[index], category: category };
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
	},

	addNotes: (transactionId: string, notes: string) => {
		appStateStore.update((state) => {
			const index = state.transactions.findIndex((t) => t.id === transactionId);
			if (index !== -1) {
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = { ...updatedTransactions[index], notes: notes };
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
	},

	// --- UI Actions ---
	setLoading: (loading: boolean) => {
		appStateStore.update((state) => ({
			...state,
			ui: { ...state.ui, loading }
		}));
	},

	// Handle selecting/deselecting for the modal
	selectTransactionForDetails: (transactionId: string | null) => {
		appStateStore.update((state) => {
			const selectedTxn = transactionId
				? state.transactions.find((t) => t.id === transactionId)
				: null;
			return {
				...state,
				ui: {
					...state.ui,
					selectedTransactionId: transactionId,
					showTransactionDetails: transactionId !== null,
					// Pre-fill modal category selector if a transaction is selected
					currentCategory: selectedTxn
						? selectedTxn.category
						: state.ui.currentCategory // Keep current if deselecting
				}
			};
		});
	},

	// Explicitly close the modal
	closeTransactionDetails: () => {
		appStateStore.update((state) => ({
			...state,
			ui: {
				...state.ui,
				showTransactionDetails: false,
				selectedTransactionId: null
			}
		}));
	},

	// Update the category selection *within* the modal
	setModalCategory: (category: Category) => {
		appStateStore.update((state) => ({
			...state,
			ui: { ...state.ui, currentCategory: category }
		}));
	},

	// --- Filter Actions ---
	setFilterCategory: (category: 'all' | Category) => {
		appStateStore.update((state) => ({
			...state,
			filters: { ...state.filters, category }
		}));
	},

	setSearchTerm: (searchTerm: string) => {
		appStateStore.update((state) => ({
			...state,
			filters: { ...state.filters, searchTerm }
		}));
	},

	toggleSort: (field: SortField) => {
		appStateStore.update((state) => {
			const currentSortField = state.filters.sortField;
			const currentSortDirection = state.filters.sortDirection;
			const newSortDirection =
				currentSortField === field ? (currentSortDirection === 'asc' ? 'desc' : 'asc') : 'asc'; // Default asc for new field
			return {
				...state,
				filters: {
					...state.filters,
					sortField: field,
					sortDirection: newSortDirection
				}
			};
		});
	},

	// --- Conversation Actions ---
	addConversationMessage: (role: 'user' | 'assistant', content: string) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				messages: [...state.conversation.messages, { role, content, timestamp: Date.now() }]
			}
		}));
	},

	setConversationStatus: (status: string, progress?: number) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				status: status,
				progress: progress !== undefined ? Math.max(0, Math.min(100, progress)) : state.conversation.progress
			}
		}));
	},

	setConversationProcessing: (isProcessing: boolean) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				isProcessing: isProcessing,
				// Reset progress/status slightly later or based on specific logic
				status: isProcessing ? state.conversation.status : '',
				progress: isProcessing ? state.conversation.progress : 0
			}
		}));
	},

	// Add/update extracted transactions *within the conversation context*
	updateConversationExtractedTransactions: (
		transactions: Transaction[],
		associatedMessage: string = '',
		batchId: string | null = null
	) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				extractedTransactions: transactions,
				_internal: {
					...state.conversation._internal,
					lastUserMessageText: associatedMessage,
					lastExtractionBatchId: batchId
				}
			}
		}));
	},
	appendConversationExtractedTransactions: (
		newTransactions: Transaction[],
		associatedMessage: string = '',
		batchId: string | null = null
	) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				extractedTransactions: [
					...state.conversation.extractedTransactions,
					...newTransactions
				],
				_internal: {
					...state.conversation._internal,
					lastUserMessageText: associatedMessage,
					lastExtractionBatchId: batchId
				}
			}
		}));
	},

	setConversationClarificationNeeded: (needed: boolean, txnIds: string[]) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				_internal: {
					...state.conversation._internal,
					waitingForDirectionClarification: needed,
					clarificationTxnIds: needed ? txnIds : []
				}
			}
		}));
	},

	resetConversation: () => {
		appStateStore.update((state) => ({
			...state,
			conversation: initialConversationState // Reset to initial
		}));
		// Add the initial greeting back after reset
		appStore.addConversationMessage(
			'assistant',
			"Okay, starting fresh. How can I help you?"
		);
	},

	// --- Bulk Processing Actions ---
	initializeBulkChunks: (chunks: string[]) => {
		const initialChunks: ProcessingChunk[] = chunks.map((chunk, index) => ({
			id: `chunk-${index}`,
			text: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''), // Short preview
			status: 'pending',
			message: '',
			transactionCount: 0
		}));
		appStateStore.update((state) => ({
			...state,
			bulkProcessing: {
				...state.bulkProcessing,
				processingChunks: initialChunks,
				processingProgress: 0,
				tempExtractedTransactions: [],
				isBulkProcessing: true
			}
		}));
	},

	updateBulkChunkStatus: (
		chunkIndex: number,
		status: ChunkStatus,
		message: string = '',
		transactions: Transaction[] = []
	) => {
		appStateStore.update((state) => {
			const chunks = [...state.bulkProcessing.processingChunks];
			if (chunkIndex >= 0 && chunkIndex < chunks.length) {
				chunks[chunkIndex] = {
					...chunks[chunkIndex],
					status,
					message,
					transactionCount: transactions.length
				};

				// Add successful transactions to the temporary list
				const newTempTransactions =
					status === 'success' && transactions.length > 0
						? [...state.bulkProcessing.tempExtractedTransactions, ...transactions]
						: state.bulkProcessing.tempExtractedTransactions;

				// Recalculate overall progress
				const completed = chunks.filter((c) => c.status === 'success' || c.status === 'error').length;
				const progress = chunks.length > 0 ? Math.floor((completed / chunks.length) * 100) : 0;

				return {
					...state,
					bulkProcessing: {
						...state.bulkProcessing,
						processingChunks: chunks,
						tempExtractedTransactions: newTempTransactions,
						processingProgress: progress
					}
				};
			}
			return state; // Return unchanged state if index is invalid
		});
	},

	// Finalize bulk processing - moves temp txns to main list if successful
	finalizeBulkProcessing: (success: boolean) => {
		appStateStore.update((state) => {
			const finalTransactions = success
				? [...state.transactions, ...state.bulkProcessing.tempExtractedTransactions]
				: state.transactions; // Keep original if cancelled/failed

			return {
				...state,
				transactions: finalTransactions, // Update main list
				bulkProcessing: { // Reset bulk state
					...initialBulkProcessingState // Use the defined initial state
				}
			};
		});
		if (success && get(appStateStore).bulkProcessing.tempExtractedTransactions.length > 0) {
			showTemporarySuccessMessage(); // Show success if transactions were added
		}
	}
};

// --- Optional: Simple Derived Stores (for easy $ syntax in components) ---
// These are thin wrappers around appStore.subscribe, selecting a slice.
// You could place these here or in adapters.ts

export const loading = derived(appStateStore, ($s) => $s.ui.loading);
export const showSuccessMessage = derived(appStateStore, ($s) => $s.ui.showSuccessMessage);
// Add others as needed...