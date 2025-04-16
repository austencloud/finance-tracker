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
	batchId: string; // ID for the batch of transactions (for bulk processing)
	date: string;
	description: string;
	type: string;
	amount: number;
	category: Category;
	notes: string;
	direction: 'in' | 'out' | 'unknown';
}
export interface ConversationState {
	messages: ConversationMessage[];
	status: string;
	isProcessing: boolean;
	progress: number;
	userMood: UserMood;
	_internal: {
		initialPromptSent: boolean;
		// Direction Clarification (Existing)
		waitingForDirectionClarification: boolean;
		clarificationTxnIds: string[];
		// Correction Context (Existing)
		lastUserMessageText: string;
		lastExtractionBatchId: string | null;
		// Duplicate Confirmation (Existing)
		waitingForDuplicateConfirmation?: boolean;
		pendingDuplicateTransactions?: Transaction[];

		// --- NEW: Correction Clarification State ---
		/** Flag indicating the app is waiting for the user to specify which transaction to correct. */
		waitingForCorrectionClarification?: boolean;
		/** Details of the correction that needs clarification */
		pendingCorrectionDetails?: {
			originalMessage: string; // The user's original correction message (e.g., "change amount to $12")
			parsedField: 'amount' | 'date' | 'description' | 'category' | 'type' | 'notes'; // The field parsed from originalMessage
			parsedValue: any; // The value parsed from originalMessage
			potentialTxnIds: string[]; // IDs of transactions that could be the target
            potentialTxnDescriptions: string[]; // Descriptions to help user choose
		} | null;
		// --- END NEW ---
	};
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
	isProcessing: boolean;
	progress: number;
	userMood: UserMood;
	_internal: {
		initialPromptSent: boolean;
		// Direction Clarification (Existing)
		waitingForDirectionClarification: boolean;
		clarificationTxnIds: string[];
		// Correction Context (Existing)
		lastUserMessageText: string;
		lastExtractionBatchId: string | null;
		// Duplicate Confirmation (Existing)
		waitingForDuplicateConfirmation?: boolean;
		pendingDuplicateTransactions?: Transaction[];

		// --- NEW: Correction Clarification State ---
		/** Flag indicating the app is waiting for the user to specify which transaction to correct. */
		waitingForCorrectionClarification?: boolean;
		/** Details of the correction that needs clarification */
		pendingCorrectionDetails?: {
			originalMessage: string; // The user's original correction message (e.g., "change amount to $12")
			parsedField: 'amount' | 'date' | 'description' | 'category' | 'type' | 'notes'; // The field parsed from originalMessage
			parsedValue: any; // The value parsed from originalMessage
			potentialTxnIds: string[]; // IDs of transactions that could be the target
            potentialTxnDescriptions: string[]; // Descriptions to help user choose
		} | null;
		// --- END NEW ---
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
