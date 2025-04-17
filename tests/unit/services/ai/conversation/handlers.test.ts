// tests/unit/services/ai/conversation/handlers.test.ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { get } from 'svelte/store'; // Keep for potential future use

// Import the specific handler to test
import { handleExtraction } from '$lib/services/ai/conversation/handlers/handleExtraction';

// Import AppStore types
import type { AppState, Transaction, ConversationMessage, Category } from '$lib/types/types';
import { llmChat } from '$lib/services/ai/llm-helpers';

// --- Mock AppStore Correctly ---
vi.mock('$lib/stores/AppStore', () => {
	let mockState: AppState;

	const resetMockState = () => {
		mockState = {
			transactions: [],
			categories: [
				'PayPal Transfers',
				'Business Income - Austen Cloud Performance',
				'Crypto Sales',
				'Non-Taxable Research/Surveys',
				'Misc Work - Insect Asylum',
				'Remote Deposits',
				'Rent Payments Received (Non-Income)',
				'Expenses',
				'Other / Uncategorized'
			],
			ui: {
				loading: false,
				showSuccessMessage: false,
				selectedTransactionId: null,
				showTransactionDetails: false,
				currentCategory: 'Expenses',
				selectedModel: '',
				availableModels: []
			},
			filters: { category: 'all', searchTerm: '', sortField: 'date', sortDirection: 'desc' },
			conversation: {
				messages: [],
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
					llmAvailable: false
				}
			},
			bulkProcessing: { processingChunks: [], processingProgress: 0, isBulkProcessing: false },
			analysis: { summary: null, anomalies: null, predictions: null, loading: false, error: null }
		};
	};
	resetMockState(); // Initialize state

	const update = vi.fn((updater: (state: AppState) => AppState) => {
		mockState = updater(mockState);
	});
	const set = vi.fn((newState: AppState) => {
		mockState = newState;
	});
	const subscribe = vi.fn((run: (state: AppState) => void) => {
		run(mockState);
		return () => {};
	});

	const transactions.add = vi.fn((newTransactions: Transaction[]) => {
		const currentIds = new Set(mockState.transactions.map((t) => t.id));
		const uniqueNew = newTransactions.filter((t) => t.id && !currentIds.has(t.id));
		mockState.transactions.push(...uniqueNew);
		mockedAppStore.runFinancialAnalysis(); // Call the mock below
	});
	const setConversationStatus = vi.fn((status: string, progress?: number) => {
		mockState.conversation.status = status;
		if (progress !== undefined) mockState.conversation.progress = progress;
	});
	const addConversationMessage = vi.fn((role: 'user' | 'assistant', content: string) => {
		return mockState.conversation.messages.push({
			role,
			content,
			timestamp: Date.now(),
			id: ''
		});
	});
	const conversation._setInternalState = vi.fn(
		(updates: Partial<AppState['conversation']['_internal']>) => {
			mockState.conversation._internal = { ...mockState.conversation._internal, ...updates };
		}
	);
	const runFinancialAnalysis = vi.fn();

	const mockedAppStore = {
		subscribe,
		update,
		set,
		transactions.add,
		setConversationStatus,
		addConversationMessage,
		conversation._setInternalState,
		runFinancialAnalysis
	};

	return { __resetMockState: resetMockState, appStore: mockedAppStore };
});

// --- Mock $lib/utils/helpers Explicitly ---
vi.mock('$lib/utils/helpers', () => ({
	__esModule: true,
	default: {},
	textLooksLikeTransaction: vi.fn((text: string): boolean => !!text && text.trim().length > 0),
	applyExplicitDirection: vi.fn(
		(transactions: Transaction[], direction: 'in' | 'out' | null): Transaction[] => {
			if (!direction) return transactions.map((t) => ({ ...t }));
			return transactions.map((t) => ({ ...t, direction: direction }));
		}
	),
	formatCurrency: vi.fn((amount) => `$${Number(amount || 0).toFixed(2)}`)
}));

// --- Mock other dependencies ---
const mockLLMTransactionData = [
	{
		date: '2024-04-01',
		description: 'Coffee Shop',
		details: 'Latte',
		type: 'Card',
		amount: 5.75,
		direction: 'OUT'
	}
];
const mockLLMJsonResponseString = JSON.stringify({ transactions: mockLLMTransactionData });
vi.mock('$lib/services/ai/deepseek-client', () => ({
	llmChat: vi.fn().mockResolvedValue(mockLLMJsonResponseString),
	deepseekGenerateJson: vi.fn().mockResolvedValue(mockLLMJsonResponseString),
	getLLMFallbackResponse: vi.fn((err) => `Fallback error: ${err?.message || 'Unknown'}`),
	isOllamaAvailable: vi.fn().mockResolvedValue(true)
}));

const mockParsedTransactions: Transaction[] = [
	{
		id: 'txn-abc-123',
		batchId: 'batch-xyz-789',
		date: '2024-04-01',
		description: 'Coffee Shop',
		type: 'Card',
		amount: 5.75,
		category: 'Expenses',
		notes: 'Latte',
		direction: 'out',
		currency: 'USD'
	}
];
vi.mock('$lib/services/ai/extraction/llm-parser', () => ({
	parseTransactionsFromLLMResponse: vi.fn().mockReturnValue(mockParsedTransactions)
}));

vi.mock('$lib/services/categorizer', () => ({
	categorizeTransaction: vi.fn((desc, type): Category => 'Expenses')
}));

vi.mock('$lib/utils/date', () => ({
	resolveAndFormatDate: vi.fn((d) => d || '2024-04-01')
}));

// === Test Suite ===

describe('Conversation Handlers', () => {
	let resetMockState: () => void;
	let mockedAppStore: any;

	beforeAll(async () => {
		const mockModule = await import('$lib/stores/AppStore');
		resetMockState = (mockModule as any).__resetMockState;
		mockedAppStore = (mockModule as any).appStore;
	});

	describe('handleExtraction', () => {
		beforeEach(() => {
			vi.clearAllMocks();
			if (resetMockState) {
				resetMockState();
			} else {
				console.error('Mock reset function (__resetMockState) not found!');
			}
		});

		it('should call parser, add valid transactions, and update context', async () => {
			const inputText = 'I spent $5.75 at the coffee shop';
			const { parseTransactionsFromLLMResponse } = await import(
				'$lib/services/ai/extraction/llm-parser'
			);

			const specificMockParsedTransactions: Transaction[] = [
				{
					id: 'new-txn-1',
					batchId: 'batch-test-1',
					date: '2024-04-01',
					description: 'Coffee Shop',
					type: 'Card',
					amount: 5.75,
					category: 'Expenses',
					notes: 'Latte',
					direction: 'out',
					currency: 'USD'
				}
			];
			vi.mocked(parseTransactionsFromLLMResponse).mockReturnValue(specificMockParsedTransactions);

			const result = await handleExtraction(inputText, null);

			expect(result.handled).toBe(true);
			expect(llmChat).toHaveBeenCalledOnce();
			expect(parseTransactionsFromLLMResponse).toHaveBeenCalledOnce();
			expect(parseTransactionsFromLLMResponse).toHaveBeenCalledWith(
				mockLLMJsonResponseString,
				expect.any(String)
			);

			expect(mockedAppStore.transactions.add).toHaveBeenCalledOnce();
			expect(mockedAppStore.transactions.add).toHaveBeenCalledWith(specificMockParsedTransactions);

			expect(mockedAppStore.conversation._setInternalState).toHaveBeenCalledOnce();
			expect(mockedAppStore.conversation._setInternalState).toHaveBeenCalledWith(
				expect.objectContaining({
					lastUserMessageText: inputText,
					lastExtractionBatchId: specificMockParsedTransactions[0].batchId
				})
			);

			expect(mockedappStore.conversation.setStatus).toHaveBeenCalledWith(
				'Extracting transactions...',
				30
			);
			expect(mockedappStore.conversation.setStatus).toHaveBeenCalledWith(
				'Extraction complete',
				100
			);
			expect(result.response).toContain('Added 1 new transaction(s).');
		});

		it('should return duplicate message if all extracted transactions already exist', async () => {
			const inputText = 'I spent $5.75 at the coffee shop again';
			const { parseTransactionsFromLLMResponse } = await import(
				'$lib/services/ai/extraction/llm-parser'
			);

			const existingTxnData: Transaction = {
				id: 'txn-abc-123',
				batchId: 'batch-prev',
				date: '2024-04-01',
				description: 'Coffee Shop',
				type: 'Card',
				amount: 5.75,
				category: 'Expenses',
				notes: 'Latte',
				direction: 'out',
				currency: 'USD'
			};
			vi.mocked(parseTransactionsFromLLMResponse).mockReturnValue([{ ...existingTxnData }]);

			resetMockState();
			mockedAppStore.update((state: AppState) => ({
				...state,
				transactions: [{ ...existingTxnData }]
			}));
			vi.clearAllMocks();

			const result = await handleExtraction(inputText, null);

			expect(result.handled).toBe(true);
			expect(parseTransactionsFromLLMResponse).toHaveBeenCalledOnce();
			expect(mockedAppStore.transactions.add).not.toHaveBeenCalled();

			expect(mockedAppStore.conversation._setInternalState).toHaveBeenCalledOnce();
			expect(mockedAppStore.conversation._setInternalState).toHaveBeenCalledWith(
				expect.objectContaining({
					lastUserMessageText: inputText,
					lastExtractionBatchId: existingTxnData.batchId
				})
			);
			expect(mockedappStore.conversation.setStatus).toHaveBeenCalledWith(
				'Duplicates detected',
				100
			);
			expect(result.response).toContain('already recorded');
		});

		it('should add only new transactions if some are duplicates', async () => {
			const inputText = 'Coffee $5.75 and Gas $40.00';
			const { parseTransactionsFromLLMResponse } = await import(
				'$lib/services/ai/extraction/llm-parser'
			);

			const coffeeTxnData: Transaction = {
				id: 'txn-coffee-dup',
				batchId: 'batch-mixed',
				date: '2024-04-01',
				description: 'Coffee Shop',
				type: 'Card',
				amount: 5.75,
				category: 'Expenses',
				notes: '',
				direction: 'out',
				currency: 'USD'
			};
			const gasTxnData: Transaction = {
				id: 'txn-gas-new',
				batchId: 'batch-mixed',
				date: '2024-04-01',
				description: 'Gas Station',
				type: 'Card',
				amount: 40.0,
				category: 'Expenses',
				notes: '',
				direction: 'out',
				currency: 'USD'
			};

			vi.mocked(parseTransactionsFromLLMResponse).mockReturnValue([coffeeTxnData, gasTxnData]);

			resetMockState();
			mockedAppStore.update((state: AppState) => ({
				...state,
				transactions: [
					{
						id: 'existing-coffee-id',
						batchId: 'batch-prev',
						date: '2024-04-01',
						description: 'Coffee Shop',
						type: 'Card',
						amount: 5.75,
						category: 'Expenses' as Category, // Added Type Assertion
						notes: '',
						direction: 'out'
					}
				]
			}));
			vi.clearAllMocks();

			// Temporarily override transactions.add mock for *this test* to simulate content check
			let currentMockState: AppState;
			mockedAppStore.subscribe((state: AppState) => (currentMockState = state)); // Capture the mock state

			vi.mocked(mockedAppStore.transactions.add).mockImplementationOnce(
				(newTransactions: Transaction[]) => {
					const existingContentKey = `${currentMockState.transactions[0].date}-${currentMockState.transactions[0].amount.toFixed(2)}-${currentMockState.transactions[0].description.toLowerCase()}-${currentMockState.transactions[0].direction}`;
					const trulyNew = newTransactions.filter((t) => {
						const newKey = `${t.date}-${t.amount.toFixed(2)}-${t.description.toLowerCase()}-${t.direction}`;
						return newKey !== existingContentKey;
					});
					// Add only the truly new ones to mockState
					const currentIds = new Set(currentMockState.transactions.map((t) => t.id));
					const uniqueNewToAdd = trulyNew.filter((t) => t.id && !currentIds.has(t.id));
					currentMockState.transactions.push(...uniqueNewToAdd);
					mockedAppStore.runFinancialAnalysis();
				}
			);

			const result = await handleExtraction(inputText, null);

			// Assert after improving mock for this specific test
			expect(result.handled).toBe(true);
			expect(parseTransactionsFromLLMResponse).toHaveBeenCalledOnce();
			expect(mockedAppStore.transactions.add).toHaveBeenCalledOnce(); // Check the mock implementation was called
			const addedArg = vi.mocked(mockedAppStore.transactions.add).mock.calls[0][0]; // Check what was passed to the mock
			expect(addedArg).toHaveLength(1); // Assert only Gas txn was added by the *mock's logic*
			expect(addedArg[0].description).toBe('Gas Station');

			expect(mockedAppStore.conversation._setInternalState).toHaveBeenCalledOnce();
			expect(mockedAppStore.conversation._setInternalState).toHaveBeenCalledWith(
				expect.objectContaining({
					lastUserMessageText: inputText,
					lastExtractionBatchId: 'batch-mixed'
				})
			);
			expect(result.response).toContain('Added 1 new transaction(s). (Ignored 1 duplicate)');
		});
	});

	// describe('handleMood', () => { /* Add tests for handleMood */ });
	// describe('handleCountCorrection', () => { /* Add tests for handleCountCorrection */ });
	// etc...
});
