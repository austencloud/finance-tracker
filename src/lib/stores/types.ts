// src/lib/stores/types.ts
import type { Transaction, Category } from '$lib/types/transactionTypes';

// UI State Types
export interface UIState {
	loading: boolean;
	showSuccessMessage: boolean;
	selectedTransaction: Transaction | null;
	showTransactionDetails: boolean;
	currentCategory: Category;
}

// Filter State Types
export type SortField = 'date' | 'amount' | 'description' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
	category: 'all' | Category;
	searchTerm: string;
	sortField: SortField;
	sortDirection: SortDirection;
}

// Conversation State Types
export interface ConversationMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number;
}

export interface ConversationState {
	messages: ConversationMessage[];
	status: string;
	isProcessing: boolean;
	progress: number;
	extractedTransactions: Transaction[];
	waitingForDirectionClarification: boolean;
	clarificationTxnIds: string[];
}

// Bulk Processing Types
export type ChunkStatus = 'pending' | 'processing' | 'success' | 'error';

export interface ProcessingChunk {
	id: string;
	text: string;
	status: ChunkStatus;
	message: string;
	transactionCount: number;
}

export interface BulkProcessingState {
	processingChunks: ProcessingChunk[];
	processingProgress: number;
	isBulkProcessing: boolean;
	tempExtractedTransactions: Transaction[];
}

// Main App State - the big kahuna
export interface AppState {
	transactions: Transaction[];
	ui: UIState;
	filters: FilterState;
	conversation: ConversationState;
	bulkProcessing: BulkProcessingState;
}
