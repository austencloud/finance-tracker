// src/lib/stores/types.ts

// --- Import dependent types from schemas ---
// Ensure these paths are correct for your project structure
import type {
	FinancialSummary,
	AnomalyDetectionResult,
	PredictionResult
} from '$lib/schemas/AnalysisSchema';

// --- Base Types (Transaction, Category, etc. - Assuming no changes needed) ---
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

// --- State Slice Interfaces ---

export interface UIState {
	loading: boolean; // General loading (e.g., for file import)
	showSuccessMessage: boolean;
	selectedTransactionId: string | null;
	showTransactionDetails: boolean;
	currentCategory: Category; // For modal interaction
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
	isProcessing: boolean; // Specific to AI response generation
	progress: number;
	// REMOVED: extractedTransactions: Transaction[];
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
	transactionCount: number; // How many txns found *in this chunk*
}
export interface BulkProcessingState {
	processingChunks: ProcessingChunk[];
	processingProgress: number;
	isBulkProcessing: boolean; // Controls the UI visibility
	// REMOVED: tempExtractedTransactions: Transaction[];
}

// --- NEW: Analysis State Slice ---
export interface AnalysisState {
	summary: FinancialSummary | null;
	anomalies: AnomalyDetectionResult | null;
	predictions: PredictionResult | null;
	loading: boolean; // Specific loading state for analysis calculations
	error: string | null; // Any error during analysis
}

// --- Updated Master AppState ---
export interface AppState {
	transactions: Transaction[]; // Single source of truth for transactions
	categories: Category[];
	ui: UIState;
	filters: FilterState;
	conversation: ConversationState;
	bulkProcessing: BulkProcessingState;
	analysis: AnalysisState; // Added analysis slice
}