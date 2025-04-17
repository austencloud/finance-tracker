import type {
	FinancialSummary as SchemaFinancialSummary,
	AnomalyDetectionResult,
	PredictionResult as SchemaPredictionResult
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
	date: string; // 'YYYY-MM-DD' or 'unknown'
	description: string;
	type: string;
	amount: number;
	currency: string; // e.g., "USD", "JPY", "BTC"
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

export interface ConversationInternalState {
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
}

export interface ConversationState {
	messages: ConversationMessage[];
	status: string;
	isProcessing: boolean;
	progress: number;
	userMood: UserMood;
	_internal: ConversationInternalState;
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

// --- UPDATED Analysis-related Types ---

export interface FinancialSummary {
	totalIncome: number;
	totalExpenses: number;
	netCashflow: number;
	savingsRate: number;
	avgIncome: number;
	avgExpense: number;
	highestIncome: number;
	highestExpense: number;
	analysis?: string | null;
	conversionErrors?: number;
	// byCategory?: Record<string, number>;
	// byMonth?: Record<string, number>;
}

export interface Anomaly {
	index: number;
	risk: 'low' | 'medium' | 'high';
	reason: string;
}

export interface AnomalyResult {
	anomalies: Anomaly[];
}

export interface PredictionResult {
	projectedMonthlyNet: number;
	predictedIncome: number;
	predictedExpenses: number;
	reliability: 'none' | 'low' | 'medium' | 'high';
	message: string;
}

export interface AnalysisState {
	summary: FinancialSummary | null;
	anomalies: AnomalyResult | null;
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
