// src/lib/stores/types.ts

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
