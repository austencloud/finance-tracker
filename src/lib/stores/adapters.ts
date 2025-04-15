// src/lib/stores/adapters.ts
import { derived, get } from 'svelte/store';
import { appStore } from './AppStore'; // Import the single central store
import type { Category, Transaction, SortField } from './types';

// --- Read-only State Slices (using derived) ---
// Components can subscribe to these with $ notation

export const transactions = derived(appStore, ($s) => $s.transactions);
export const loading = derived(appStore, ($s) => $s.ui.loading);
export const showSuccessMessage = derived(appStore, ($s) => $s.ui.showSuccessMessage);
export const categories = derived(appStore, ($s) => $s.categories); // Assuming categories are in AppState

// Selected transaction *object* derived from the ID in state
export const selectedTransaction = derived(appStore, ($s) =>
	$s.ui.selectedTransactionId ? appStore.getTransactionById($s.ui.selectedTransactionId) : null
);
export const showTransactionDetails = derived(appStore, ($s) => $s.ui.showTransactionDetails);
export const currentCategory = derived(appStore, ($s) => $s.ui.currentCategory);

// Filters
export const filterCategory = derived(appStore, ($s) => $s.filters.category);
export const searchTerm = derived(appStore, ($s) => $s.filters.searchTerm);
export const sortField = derived(appStore, ($s) => $s.filters.sortField);
export const sortDirection = derived(appStore, ($s) => $s.filters.sortDirection);

// Computed Values as derived stores
export const sortedTransactions = derived(appStore, ($s) =>
	appStore.getSortedFilteredTransactions()
);
export const categoryTotals = derived(appStore, ($s) => appStore.getCategoryTotals());

// Bulk Processing UI state
export const isBulkProcessing = derived(appStore, ($s) => $s.bulkProcessing.isBulkProcessing);
export const processingChunks = derived(appStore, ($s) => $s.bulkProcessing.processingChunks);
export const processingProgress = derived(appStore, ($s) => $s.bulkProcessing.processingProgress);
export const tempExtractedTransactions = derived(
	appStore,
	($s) => $s.bulkProcessing.tempExtractedTransactions
);
export const processingStats = derived(appStore, ($s) => {
	// Calculate stats based on bulkProcessing state
	const chunks = $s.bulkProcessing.processingChunks;
	const successChunks = chunks.filter((c) => c.status === 'success').length;
	const errorChunks = chunks.filter((c) => c.status === 'error').length;
	const pendingChunks = chunks.filter(
		(c) => c.status === 'pending' || c.status === 'processing'
	).length;
	return {
		totalChunks: chunks.length,
		successChunks,
		errorChunks,
		pendingChunks,
		transactionCount: $s.bulkProcessing.tempExtractedTransactions.length,
		isComplete: chunks.length > 0 && pendingChunks === 0
	};
});

// Conversation UI state
export const conversationMessages = derived(appStore, ($s) => $s.conversation.messages);
export const conversationStatus = derived(appStore, ($s) => $s.conversation.status);
export const conversationProgress = derived(appStore, ($s) => $s.conversation.progress);
export const isProcessing = // Renamed from conversationIsProcessing for consistency
	derived(appStore, ($s) => $s.conversation.isProcessing);
export const extractedTransactions = // Conversation specific extractions
	derived(appStore, ($s) => $s.conversation.extractedTransactions);

// --- Actions ---
// Just forward the action calls to the central store's methods

export const addTransactions = (newTransactions: Transaction[]) =>
	appStore.addTransactions(newTransactions);
export const clearTransactions = () => appStore.clearTransactions();
export const deleteTransaction = (id: string) => appStore.deleteTransaction(id);
export const updateTransaction = (updatedTransaction: Transaction) =>
	appStore.updateTransaction(updatedTransaction);

// Updated to pass ID instead of the whole object
export const assignCategory = (transaction: Transaction, category: Category) => {
	if (transaction?.id) {
		appStore.assignCategory(transaction.id, category);
	} else {
		console.error('Cannot assign category: Transaction or ID missing');
	}
};
export const addNotes = (transaction: Transaction, notes: string) => {
	if (transaction?.id) {
		appStore.addNotes(transaction.id, notes);
	} else {
		console.error('Cannot add notes: Transaction or ID missing');
	}
};

// UI Actions mediated through adapters
export const setLoading = (loading: boolean) => appStore.setLoading(loading);
export const setCurrentCategory = (category: Category) => appStore.setModalCategory(category);

// Filter Actions
export const setFilterCategory = (category: 'all' | Category) =>
	appStore.setFilterCategory(category);
export const setSearchTerm = (term: string) => appStore.setSearchTerm(term);
export const toggleSort = (field: SortField) => appStore.toggleSort(field);

// Bulk Processing Actions mediated through adapters
export const finalizeBulkProcessing = (success: boolean) =>
	appStore.finalizeBulkProcessing(success);
// initializeChunks etc. are likely called from services, which should import AppStore directly

// Conversation Actions mediated through adapters
export const addConversationMessage = (role: 'user' | 'assistant', content: string) =>
	appStore.addConversationMessage(role, content);
// Other conversation actions (sendMessage, generateSummary) should likely be called
// from components/services importing conversationService, which itself uses AppStore now.
export const closeTransactionDetails = () => appStore.closeTransactionDetails();
