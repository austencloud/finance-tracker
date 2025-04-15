// src/lib/stores/AppStore.ts
import { writable, get, derived, type Writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

// --- Import Analytics Service ---
import {
	calculateFinancialSummary,
	detectAnomalies,
	predictFutureTransactions
} from '$lib/services/analytics'; // Adjust path if needed
import { isLLMAvailable } from '$lib/services/ai/deepseek-client'; // Check LLM status

import type {
	AppState,
	Transaction,
	Category,
	CategoryTotals,
	UIState,
	FilterState,
	SortField,
	ConversationState,
	ConversationMessage,
	BulkProcessingState,
	ProcessingChunk,
	ChunkStatus,
	UserMood,
	// --- Import Analysis Types ---
	AnalysisState
} from './types';

// --- Initial State Definitions ---

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
	isBulkProcessing: false
};

const initialAnalysisState: AnalysisState = {
	summary: null,
	anomalies: null,
	predictions: null,
	loading: false,
	error: null
};

const initialState: AppState = {
	transactions: [],
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
	bulkProcessing: initialBulkProcessingState,
	analysis: initialAnalysisState
};

// --- Central Store ---
const appStateStore: Writable<AppState> = writable(initialState);

// --- Helpers ---
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

let analysisTimeout: ReturnType<typeof setTimeout> | null = null;
const ANALYSIS_DEBOUNCE_MS = 500;

function triggerAnalysisRun() {
	if (analysisTimeout) {
		clearTimeout(analysisTimeout);
	}
	analysisTimeout = setTimeout(() => {
		if (appStore && typeof appStore.runFinancialAnalysis === 'function') {
			console.log('[AppStore] Debounced: Running financial analysis...');
			appStore.runFinancialAnalysis();
		} else {
			console.warn('[AppStore] Debounced: appStore or runFinancialAnalysis not ready yet.');
		}
	}, ANALYSIS_DEBOUNCE_MS);
}

// --- Exported Store Object ---
export const appStore = {
	subscribe: appStateStore.subscribe,

	// === SELECTORS / COMPUTED VALUES ===
	getTransactionById: (id: string | null): Transaction | null => {
		if (!id) return null;
		const state = get(appStateStore);
		return state.transactions.find((t) => t.id === id) || null;
	},
	getSortedFilteredTransactions: (): Transaction[] => {
		const state = get(appStateStore);
		const { transactions, filters } = state;
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
		return [...filtered].sort((a, b) => {
			let valueA: any, valueB: any;
			switch (filters.sortField) {
				case 'amount':
					valueA = a.amount;
					valueB = b.amount;
					break;
				case 'date':
					try {
						const dateA = new Date(a.date).getTime();
						const dateB = new Date(b.date).getTime();
						valueA = isNaN(dateA) ? 0 : dateA;
						valueB = isNaN(dateB) ? 0 : dateB;
						if (isNaN(dateA) && isNaN(dateB)) {
							valueA = a.date;
							valueB = b.date;
						}
					} catch {
						valueA = a.date;
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
					valueA = a[filters.sortField];
					valueB = b[filters.sortField];
			}
			const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
			return filters.sortDirection === 'asc' ? comparison : -comparison;
		});
	},
	getCategoryTotals: (): CategoryTotals => {
		const state = get(appStateStore);
		const totals: CategoryTotals = {};
		state.categories.forEach((cat) => {
			totals[cat] = 0;
		});
		state.transactions.forEach((txn) => {
			if (txn.category && totals.hasOwnProperty(txn.category)) {
				const amount = txn.amount || 0;
				const adjustedAmount = txn.direction === 'out' ? -Math.abs(amount) : Math.abs(amount);
				totals[txn.category] += adjustedAmount;
			}
		});
		return totals;
	},

	// === ACTIONS ===

	// --- Transaction Actions (Now Trigger Analysis) ---
	addTransactions: (newTransactions: Transaction[]) => {
		if (!Array.isArray(newTransactions) || newTransactions.length === 0) {
			console.log('[AppStore.addTransactions] Received empty or invalid input. Skipping.'); // DEBUG
			return;
		}
		let itemsAdded = false;
		let addedCount = 0; // Keep track of how many were actually added

		appStateStore.update((state) => {
			const currentIds = new Set(state.transactions.map((t) => t.id));
			const uniqueNewTransactions = newTransactions.filter((newTxn) => {
				if (!newTxn || typeof newTxn !== 'object') {
					console.warn('[AppStore.addTransactions] Skipping invalid transaction object:', newTxn); // DEBUG
					return false;
				}
				// Ensure ID exists, generate if missing (consider if this is desired behavior)
				if (!newTxn.id) {
					newTxn.id = uuidv4();
					console.warn(
						`[AppStore.addTransactions] Transaction missing ID, generated new one: ${newTxn.id}`,
						newTxn
					); // DEBUG
				}
				if (currentIds.has(newTxn.id)) {
					console.log(`[AppStore.addTransactions] Skipping duplicate transaction ID: ${newTxn.id}`); // DEBUG
					return false;
				}
				return true;
			});

			if (uniqueNewTransactions.length > 0) {
				// *** ADDED DEBUG LOG HERE ***
				console.log(
					'[AppStore.addTransactions] Attempting to add transactions to appStore:',
					JSON.stringify(uniqueNewTransactions)
				);
				// *************************
				itemsAdded = true;
				addedCount = uniqueNewTransactions.length; // Store the count
				return {
					...state,
					transactions: [...state.transactions, ...uniqueNewTransactions]
				};
			} else {
				console.log('[AppStore.addTransactions] No unique transactions to add.'); // DEBUG
			}
			return state; // Return unchanged state if no unique items added
		});

		if (itemsAdded) {
			console.log(
				`[AppStore.addTransactions] Successfully added ${addedCount} unique transaction(s).`
			); // DEBUG
			showTemporarySuccessMessage();
			triggerAnalysisRun(); // Trigger analysis
		} else {
			console.log('[AppStore.addTransactions] No items were added (duplicates or invalid).'); // DEBUG
		}
	},
	clearTransactions: () => {
		if (confirm('Are you sure you want to clear all transactions? This cannot be undone.')) {
			appStateStore.update((state) => ({ ...state, transactions: [] }));
			triggerAnalysisRun(); // Trigger analysis
		}
	},
	deleteTransaction: (id: string) => {
		let itemDeleted = false;
		appStateStore.update((state) => {
			const initialLength = state.transactions.length;
			const newTransactions = state.transactions.filter((t) => t.id !== id);
			itemDeleted = newTransactions.length < initialLength;
			return {
				...state,
				transactions: newTransactions,
				ui: {
					...state.ui,
					selectedTransactionId:
						state.ui.selectedTransactionId === id ? null : state.ui.selectedTransactionId,
					showTransactionDetails:
						state.ui.selectedTransactionId === id ? false : state.ui.showTransactionDetails
				}
			};
		});
		if (itemDeleted) {
			triggerAnalysisRun(); // Trigger analysis
		}
	},
	updateTransaction: (updatedTransaction: Transaction) => {
		let itemUpdated = false;
		appStateStore.update((state) => {
			const index = state.transactions.findIndex((t) => t.id === updatedTransaction.id);
			if (index !== -1) {
				itemUpdated = true;
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = updatedTransaction;
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
		if (itemUpdated) {
			triggerAnalysisRun(); // Trigger analysis
		}
	},
	assignCategory: (transactionId: string, category: Category) => {
		let itemUpdated = false;
		appStateStore.update((state) => {
			const index = state.transactions.findIndex((t) => t.id === transactionId);
			if (index !== -1) {
				itemUpdated = true;
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = { ...updatedTransactions[index], category: category };
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
		if (itemUpdated) {
			triggerAnalysisRun(); // Trigger analysis
		}
	},
	addNotes: (transactionId: string, notes: string) => {
		let itemUpdated = false;
		appStateStore.update((state) => {
			const index = state.transactions.findIndex((t) => t.id === transactionId);
			if (index !== -1) {
				itemUpdated = true;
				const updatedTransactions = [...state.transactions];
				updatedTransactions[index] = { ...updatedTransactions[index], notes: notes };
				return { ...state, transactions: updatedTransactions };
			}
			return state;
		});
		if (itemUpdated) {
			// Optional: triggerAnalysisRun(); // Notes might not affect core analysis
		}
	},

	// --- UI Actions ---
	setLoading: (loading: boolean) => {
		appStateStore.update((state) => ({ ...state, ui: { ...state.ui, loading } }));
	},
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
					currentCategory: selectedTxn ? selectedTxn.category : state.ui.currentCategory
				}
			};
		});
	},
	closeTransactionDetails: () => {
		appStateStore.update((state) => ({
			...state,
			ui: { ...state.ui, showTransactionDetails: false, selectedTransactionId: null }
		}));
	},
	setModalCategory: (category: Category) => {
		appStateStore.update((state) => ({ ...state, ui: { ...state.ui, currentCategory: category } }));
	},

	// --- Filter Actions ---
	setFilterCategory: (category: 'all' | Category) => {
		appStateStore.update((state) => ({ ...state, filters: { ...state.filters, category } }));
	},
	setSearchTerm: (searchTerm: string) => {
		appStateStore.update((state) => ({ ...state, filters: { ...state.filters, searchTerm } }));
	},
	toggleSort: (field: SortField) => {
		appStateStore.update((state) => {
			const currentSortField = state.filters.sortField;
			const currentSortDirection = state.filters.sortDirection;
			const newSortDirection =
				currentSortField === field ? (currentSortDirection === 'asc' ? 'desc' : 'asc') : 'asc';
			return {
				...state,
				filters: { ...state.filters, sortField: field, sortDirection: newSortDirection }
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
				progress:
					progress !== undefined
						? Math.max(0, Math.min(100, progress))
						: state.conversation.progress
			}
		}));
	},
	setConversationProcessing: (isProcessing: boolean) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				isProcessing: isProcessing,
				status: isProcessing ? state.conversation.status : '',
				progress: isProcessing ? state.conversation.progress : 0
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
			conversation: {
				...initialConversationState,
				messages: [
					{
						role: 'assistant',
						content: 'Okay, starting fresh. How can I help you?',
						timestamp: Date.now()
					}
				]
			}
		}));
	},

	// --- Bulk Processing Actions ---
	initializeBulkChunks: (chunks: string[]) => {
		const initialChunks: ProcessingChunk[] = chunks.map((chunk, index) => ({
			id: `chunk-${index}`,
			text: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''),
			status: 'pending',
			message: '',
			transactionCount: 0
		}));
		appStateStore.update((state) => ({
			...state,
			bulkProcessing: {
				...initialBulkProcessingState,
				processingChunks: initialChunks,
				isBulkProcessing: true
			}
		}));
	},
	updateBulkChunkStatus: (
		chunkIndex: number,
		status: ChunkStatus,
		message: string = '',
		transactions: Transaction[] = [] // Still accept txns to update count
	) => {
		appStateStore.update((state) => {
			const chunks = [...state.bulkProcessing.processingChunks];
			if (chunkIndex >= 0 && chunkIndex < chunks.length) {
				chunks[chunkIndex] = {
					...chunks[chunkIndex],
					status,
					message,
					transactionCount: transactions.length // Update count for UI
				};
				const completed = chunks.filter(
					(c) => c.status === 'success' || c.status === 'error'
				).length;
				const progress = chunks.length > 0 ? Math.floor((completed / chunks.length) * 100) : 0;
				return {
					...state,
					bulkProcessing: {
						...state.bulkProcessing,
						processingChunks: chunks,
						processingProgress: progress
					}
				};
			}
			return state;
		});
	},
	finalizeBulkProcessing: (success: boolean) => {
		appStateStore.update((state) => {
			// Transactions were already added incrementally via addTransactions
			return {
				...state,
				bulkProcessing: { ...initialBulkProcessingState } // Reset to initial
			};
		});
	},

	// --- NEW Analysis Actions ---
	setAnalysisLoading: (loading: boolean) => {
		appStateStore.update((state) => ({
			...state,
			analysis: { ...state.analysis, loading, error: loading ? null : state.analysis.error }
		}));
	},
	setAnalysisResults: (results: { summary: any; anomalies: any; predictions: any } | null) => {
		appStateStore.update((state) => ({
			...state,
			analysis: {
				...state.analysis,
				summary: results?.summary ?? null,
				anomalies: results?.anomalies ?? null,
				predictions: results?.predictions ?? null,
				loading: false,
				error: null
			}
		}));
	},
	setAnalysisError: (error: string | null) => {
		appStateStore.update((state) => ({
			...state,
			analysis: { ...state.analysis, error, loading: false }
		}));
	},
	runFinancialAnalysis: async () => {
		console.log('[AppStore] Running runFinancialAnalysis...');
		const state = get(appStateStore);
		if (state.transactions.length === 0) {
			console.log('[AppStore] No transactions, clearing analysis.');
			appStore.setAnalysisResults(null);
			return;
		}
		if (state.analysis.loading) {
			console.log('[AppStore] Analysis already in progress, skipping.');
			return;
		}

		appStore.setAnalysisLoading(true);
		try {
			const currentTransactions = [...state.transactions];
			const llmCheck = await isLLMAvailable();

			const summaryPromise = calculateFinancialSummary(currentTransactions);
			const anomaliesPromise = llmCheck
				? detectAnomalies(currentTransactions)
				: Promise.resolve({ anomalies: [] });
			const predictionsPromise = llmCheck
				? predictFutureTransactions(currentTransactions)
				: Promise.resolve(null);

			const [summaryResult, anomaliesResult, predictionsResult] = await Promise.all([
				summaryPromise,
				anomaliesPromise,
				predictionsPromise
			]);

			console.log('[AppStore] Analysis calculations complete.');
			appStore.setAnalysisResults({
				summary: summaryResult,
				anomalies: anomaliesResult,
				predictions: predictionsResult
			});
		} catch (error) {
			console.error('[AppStore] Error during financial analysis:', error);
			appStore.setAnalysisError(error instanceof Error ? error.message : 'Unknown analysis error');
		}
	}
};

// Optional: Trigger initial analysis if loading persisted data
// queueMicrotask(() => {
//     if (get(appStateStore).transactions.length > 0) {
//         console.log('[AppStore] Initial data detected, triggering analysis.');
//         appStore.runFinancialAnalysis();
//     }
// });
