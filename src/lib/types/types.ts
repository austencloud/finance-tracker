import type {
	FinancialSummary,
	AnomalyDetectionResult,
	PredictionResult
} from '$lib/schemas/AnalysisSchema';

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

export type SplitBillContext = {
	totalAmount: number;
	currency: string;
	originalMessage: string;
	possibleDate: string;
	description?: string;
} | null;

export interface Transaction {
	id: string;
	batchId: string;
	date: string;
	description: string;
	type: string;
	amount: number;
	currency: string;
	category: Category;
	notes: string;
	direction: 'in' | 'out' | 'unknown';
	needs_clarification?: string | null;
}

export interface ConversationMessage {
	id: string;
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
		waitingForDirectionClarification: boolean;
		clarificationTxnIds: string[];
		lastUserMessageText: string;
		lastExtractionBatchId: string | null;
		waitingForDuplicateConfirmation?: boolean;
		pendingDuplicateTransactions?: Transaction[];
		waitingForCorrectionClarification?: boolean;
		pendingCorrectionDetails?: {
			originalMessage: string;
			parsedField: 'amount' | 'date' | 'description' | 'category' | 'type' | 'notes';
			parsedValue: any;
			potentialTxnIds: string[];
			potentialTxnDescriptions: string[];
		} | null;
		llmAvailable: boolean;
		lastCorrectionTxnId?: string | null;
		waitingForSplitBillShare?: boolean;
		splitBillContext?: SplitBillContext;
	};
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
	selectedModel: string;
	availableModels: { id: string; name: string; backend: 'ollama' | 'deepseek' }[];
}

export type SortField = 'date' | 'amount' | 'description' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
	category: 'all' | Category;
	searchTerm: string;
	sortField: SortField;
	sortDirection: SortDirection;
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
}

export interface AnalysisState {
	summary: FinancialSummary | null;
	anomalies: AnomalyDetectionResult | null;
	predictions: PredictionResult | null;
	loading: boolean;
	error: string | null;
}

export interface AppState {
	transactions: Transaction[];
	categories: Category[];
	ui: UIState;
	filters: FilterState;
	conversation: ConversationState;
	bulkProcessing: BulkProcessingState;
	analysis: AnalysisState;
}
