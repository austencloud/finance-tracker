import { writable, get, type Writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

import {
	calculateFinancialSummary,
	detectAnomalies,
	predictFutureTransactions
} from '$lib/services/analytics';
import { isOllamaAvailable } from '$lib/services/ai/ollama-client';

import type {
	AppState,
	Transaction,
	Category,
	CategoryTotals,
	SortField,
	ConversationState,
	ConversationMessage,
	BulkProcessingState,
	ProcessingChunk,
	ChunkStatus,
	AnalysisState
} from './types';
import { OLLAMA_CONFIG } from '$lib/config/ai-config';

// ────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────────────────

const createMsg = (role: ConversationMessage['role'], content: string): ConversationMessage => ({
	id: uuidv4(),
	role,
	content,
	timestamp: Date.now()
});

let analysisTimeout: ReturnType<typeof setTimeout> | null = null;
const ANALYSIS_DEBOUNCE_MS = 500;

function debounceAnalysis(run: () => void) {
	if (analysisTimeout) clearTimeout(analysisTimeout);
	analysisTimeout = setTimeout(run, ANALYSIS_DEBOUNCE_MS);
}

function showTemporarySuccessMessage(duration = 3000) {
	appStateStore.update((s) => ({
		...s,
		ui: { ...s.ui, showSuccessMessage: true }
	}));
	setTimeout(() => {
		appStateStore.update((s) => ({
			...s,
			ui: { ...s.ui, showSuccessMessage: false }
		}));
	}, duration);
}

// ────────────────────────────────────────────────────────────────────────────
//  INITIAL CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

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
		createMsg(
			'assistant',
			"Hello! I'm your AI Transaction Assistant. Paste your transaction data or describe your spending and I'll help you organise it."
		)
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
		lastExtractionBatchId: null,
		waitingForDuplicateConfirmation: false,
		pendingDuplicateTransactions: [],
		waitingForCorrectionClarification: false,
		pendingCorrectionDetails: null,
		llmAvailable: false
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
		currentCategory: initialCategories.includes('Expenses') ? 'Expenses' : initialCategories[0],
		selectedModel: OLLAMA_CONFIG.model,
		availableModels: [{ id: OLLAMA_CONFIG.model, name: OLLAMA_CONFIG.model, backend: 'ollama' }]
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

// ────────────────────────────────────────────────────────────────────────────
//  STORE INSTANCE
// ────────────────────────────────────────────────────────────────────────────

const appStateStore: Writable<AppState> = writable(initialState);

// ────────────────────────────────────────────────────────────────────────────
//  STORE API (PUBLIC)
// ────────────────────────────────────────────────────────────────────────────

export const appStore = {
	subscribe: appStateStore.subscribe,

	// Conversation helpers
	addConversationMessage(role: 'user' | 'assistant', content: string) {
		const msg = {
			id: uuidv4(), //  ← NEW guaranteed‑unique key
			role,
			content: content.trim(),
			timestamp: Date.now()
		};

		appStateStore.update((s) => {
			s.conversation.messages.push(msg);
			return s;
		});
	},

	resetConversation() {
		appStateStore.update((s) => ({
			...s,
			conversation: {
				...initialConversationState,
				messages: [createMsg('assistant', 'Okay, starting fresh. How can I help you?')]
			}
		}));
	},

	setConversationStatus(status: string, progress?: number) {
		appStateStore.update((s) => ({
			...s,
			conversation: {
				...s.conversation,
				status,
				progress:
					progress !== undefined ? Math.max(0, Math.min(100, progress)) : s.conversation.progress
			}
		}));
	},

	setConversationProcessing(isProcessing: boolean) {
		appStateStore.update((s) => ({
			...s,
			conversation: {
				...s.conversation,
				isProcessing,
				status: isProcessing ? s.conversation.status : '',
				progress: isProcessing ? s.conversation.progress : 0
			}
		}));
	},

	setLLMAvailability(available: boolean) {
		appStateStore.update((s) => ({
			...s,
			conversation: {
				...s.conversation,
				_internal: { ...s.conversation._internal, llmAvailable: available }
			}
		}));
	},

	// Transaction helpers
	getTransactionById(id: string | null): Transaction | null {
		if (!id) return null;
		return get(appStateStore).transactions.find((t) => t.id === id) ?? null;
	},

	addTransactions(txns: Transaction[]) {
		if (!txns.length) return;
		appStateStore.update((state) => {
			const existing = new Set(state.transactions.map((t) => t.id));
			const uniq = txns
				.map((t) => (t.id ? t : { ...t, id: uuidv4() }))
				.filter((t) => !existing.has(t.id));
			if (!uniq.length) return state;

			showTemporarySuccessMessage();
			debounceAnalysis(() => appStore.runFinancialAnalysis());
			return { ...state, transactions: [...state.transactions, ...uniq] };
		});
	},

	clearTransactions() {
		if (!confirm('Are you sure you want to clear all transactions? This cannot be undone.')) return;
		appStateStore.update((s) => ({ ...s, transactions: [] }));
		appStore.runFinancialAnalysis();
	},

	deleteTransaction(id: string) {
		appStateStore.update((state) => {
			const txns = state.transactions.filter((t) => t.id !== id);
			if (txns.length === state.transactions.length) return state;
			debounceAnalysis(() => appStore.runFinancialAnalysis());
			return {
				...state,
				transactions: txns,
				ui: {
					...state.ui,
					selectedTransactionId:
						state.ui.selectedTransactionId === id ? null : state.ui.selectedTransactionId,
					showTransactionDetails:
						state.ui.selectedTransactionId === id ? false : state.ui.showTransactionDetails
				}
			};
		});
	},

	updateTransaction(updated: Transaction) {
		appStateStore.update((state) => {
			const idx = state.transactions.findIndex((t) => t.id === updated.id);
			if (idx === -1) return state;
			const txns = [...state.transactions];
			txns[idx] = updated;
			debounceAnalysis(() => appStore.runFinancialAnalysis());
			return { ...state, transactions: txns };
		});
	},

	assignCategory(transactionId: string, category: Category) {
		const txn = appStore.getTransactionById(transactionId);
		if (!txn) return;
		appStore.updateTransaction({ ...txn, category });
	},

	addNotes(transactionId: string, notes: string) {
		const txn = appStore.getTransactionById(transactionId);
		if (!txn) return;
		appStore.updateTransaction({ ...txn, notes });
	},

	// Sorting / filtering / UI
	setFilterCategory(category: 'all' | Category) {
		appStateStore.update((s) => ({ ...s, filters: { ...s.filters, category } }));
	},

	setSearchTerm(term: string) {
		appStateStore.update((s) => ({ ...s, filters: { ...s.filters, searchTerm: term } }));
	},

	toggleSort(field: SortField) {
		appStateStore.update((s) => {
			const dir =
				s.filters.sortField === field && s.filters.sortDirection === 'asc' ? 'desc' : 'asc';
			return { ...s, filters: { ...s.filters, sortField: field, sortDirection: dir } };
		});
	},

	selectTransactionForDetails(transactionId: string | null) {
		appStateStore.update((state) => {
			const selected = transactionId
				? state.transactions.find((t) => t.id === transactionId)
				: null;
			return {
				...state,
				ui: {
					...state.ui,
					selectedTransactionId: transactionId,
					showTransactionDetails: !!transactionId,
					currentCategory: selected ? selected.category : state.ui.currentCategory
				}
			};
		});
	},

	closeTransactionDetails() {
		appStateStore.update((s) => ({
			...s,
			ui: { ...s.ui, selectedTransactionId: null, showTransactionDetails: false }
		}));
	},

	setModalCategory(category: Category) {
		appStateStore.update((s) => ({ ...s, ui: { ...s.ui, currentCategory: category } }));
	},

	setSelectedModel(modelId: string) {
		appStateStore.update((s) => {
			const exists = s.ui.availableModels.some((m) => m.id === modelId);
			return exists ? { ...s, ui: { ...s.ui, selectedModel: modelId } } : s;
		});
	},

	addCustomModel(modelId: string, autoSelect = true) {
		if (!modelId.trim()) return;
		appStateStore.update((s) => {
			if (s.ui.availableModels.some((m) => m.id === modelId)) return s;
			return {
				...s,
				ui: {
					...s.ui,
					selectedModel: autoSelect ? modelId : s.ui.selectedModel,
					availableModels: [
						...s.ui.availableModels,
						{ id: modelId, name: modelId, backend: 'ollama' }
					]
				}
			};
		});
	},

	// --- All other methods remain unchanged below ---

	setCorrectionClarificationNeeded(
		pendingDetails: Exclude<AppState['conversation']['_internal']['pendingCorrectionDetails'], null>
	) {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				_internal: {
					...state.conversation._internal,
					waitingForCorrectionClarification: true,
					pendingCorrectionDetails: pendingDetails,
					lastUserMessageText: '',
					lastExtractionBatchId: null
				}
			}
		}));
	},

	clearCorrectionClarificationState() {
		appStateStore.update((state) => {
			if (!state.conversation._internal.waitingForCorrectionClarification) {
				return state;
			}
			return {
				...state,
				conversation: {
					...state.conversation,
					_internal: {
						...state.conversation._internal,
						waitingForCorrectionClarification: false,
						pendingCorrectionDetails: null
					}
				}
			};
		});
	},

	setConversationClarificationNeeded(needed: boolean, txnIds: string[]) {
		appStateStore.update((s) => ({
			...s,
			conversation: {
				...s.conversation,
				_internal: {
					...s.conversation._internal,
					waitingForDirectionClarification: needed,
					clarificationTxnIds: needed ? txnIds : []
				}
			}
		}));
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

	setLoading: (loading: boolean) => {
		appStateStore.update((state) => ({ ...state, ui: { ...state.ui, loading } }));
	},

	_setConversationInternalState: (updates: Partial<AppState['conversation']['_internal']>) => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				_internal: {
					...state.conversation._internal,
					...updates
				}
			}
		}));
	},

	clearCorrectionContext: () => {
		appStateStore.update((state) => ({
			...state,
			conversation: {
				...state.conversation,
				_internal: {
					...state.conversation._internal,
					lastUserMessageText: '',
					lastExtractionBatchId: null
				}
			}
		}));
	},

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
			return {
				...state,
				bulkProcessing: { ...initialBulkProcessingState }
			};
		});
	},

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

	async runFinancialAnalysis() {
		const state = get(appStateStore);
		if (state.transactions.length === 0) {
			appStore.setAnalysisResults(null);
			return;
		}
		if (state.analysis.loading) return;

		appStore.setAnalysisLoading(true);
		try {
			const currentTransactions = [...state.transactions];
			const llmCheck = await isOllamaAvailable();

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

			appStore.setAnalysisResults({
				summary: summaryResult,
				anomalies: anomaliesResult,
				predictions: predictionsResult
			});
		} catch (error) {
			appStore.setAnalysisError(error instanceof Error ? error.message : 'Unknown analysis error');
		}
	}
};
