// src/lib/stores/types.ts

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
	id: string;
	date: string;
	description: string;
	type: string;
	amount: number;
	category: Category;
	notes: string;
	direction: 'in' | 'out' | 'unknown';
}

export interface CategoryTotals {
	[key: string]: number;
}

export interface UIState {
	loading: boolean;
	showSuccessMessage: boolean;
	selectedTransactionId: string | null;
	showTransactionDetails: boolean;
	currentCategory: Category;
}

export type SortField = 'date' | 'amount' | 'description' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
	category: 'all' | Category;
	searchTerm: string;
	sortField: SortField;
	sortDirection: SortDirection;
}

export interface ConversationMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number;
}
export type UserMood = 'neutral' | 'frustrated' | 'chatty' | 'unknown';
export interface ConversationState {
	messages: ConversationMessage[];
	status: string;
	isProcessing: boolean;
	progress: number;
	extractedTransactions: Transaction[];
	userMood: UserMood;
	_internal: {
		initialPromptSent: boolean;
		waitingForDirectionClarification: boolean;
		clarificationTxnIds: string[];
		lastUserMessageText: string;
		lastExtractionBatchId: string | null;
	};
}

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

export interface AppState {
	transactions: Transaction[];
	categories: Category[];
	ui: UIState;
	filters: FilterState;
	conversation: ConversationState;
	bulkProcessing: BulkProcessingState;
}
