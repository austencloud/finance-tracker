// src/lib/stores/types.ts

// Keep your existing Transaction, Category, etc. types...
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
	id: string; // Assuming UUID string based on local-extractors.ts
	date: string;
	description: string;
	type: string;
	amount: number; // Assuming number based on local-extractors.ts
	category: Category;
	notes: string;
	direction: 'in' | 'out' | 'unknown';
}

export interface CategoryTotals {
	[key: string]: number;
}

// --- NEW AppState Structure ---

export interface UIState {
	loading: boolean;
	showSuccessMessage: boolean;
	selectedTransactionId: string | null; // Store ID instead of the whole object
	showTransactionDetails: boolean;
	currentCategory: Category; // Category for the modal selection
}

export type SortField = 'date' | 'amount' | 'description' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
	category: 'all' | Category;
	searchTerm: string;
	sortField: SortField;
	sortDirection: SortDirection;
}

// Integrate Conversation State (assuming its structure)
export interface ConversationMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number;
}
export type UserMood = 'neutral' | 'frustrated' | 'chatty' | 'unknown'; // From conversationStore
export interface ConversationState {
	messages: ConversationMessage[];
	status: string;
	isProcessing: boolean;
	progress: number;
	extractedTransactions: Transaction[]; // Transactions extracted *within* the chat UI
	userMood: UserMood; // From conversationStore
	// Internal state needed by handlers (simplified)
	_internal: {
		initialPromptSent: boolean;
		waitingForDirectionClarification: boolean;
		clarificationTxnIds: string[];
		lastUserMessageText: string; // Context for corrections
		lastExtractionBatchId: string | null; // Context for corrections
		// Add other internal fields from conversationStore._internal if needed
	};
}

// Integrate Bulk Processing State
export type ChunkStatus = 'pending' | 'processing' | 'success' | 'error';
export interface ProcessingChunk {
	id: string; // e.g., chunk-0, chunk-1
	text: string; // Preview text
	status: ChunkStatus;
	message: string; // Status message (e.g., "Extracted 5 txns", "Error: ...")
	transactionCount: number; // Txns extracted *from this chunk*
}
export interface BulkProcessingState {
	processingChunks: ProcessingChunk[]; // Status of each chunk
	processingProgress: number; // Overall percentage (0-100)
	isBulkProcessing: boolean; // Is the UI active?
	tempExtractedTransactions: Transaction[]; // Aggregated transactions from successful chunks
}

// The Master State Interface
export interface AppState {
	transactions: Transaction[]; // The main list of finalized transactions
	categories: Category[]; // Static list of available categories
	ui: UIState;
	filters: FilterState;
	conversation: ConversationState; // State for the AI chat feature
	bulkProcessing: BulkProcessingState; // State for the bulk processing UI/flow
}