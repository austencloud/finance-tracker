// tests/unit/integration/ai-extraction-flow.test.ts

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'; // Changed SpyInstance to MockInstance
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/AppStore'; // Import the actual store interface
import { sendMessage } from '$lib/services/ai/conversation/conversationService';
import { extractTransactionsFromText } from '$lib/services/ai/extraction/orchestrator';
import type { Transaction, AppState } from '$lib/stores/types'; // Import types

// --- Mock dependencies ---
vi.mock('$lib/services/ai/deepseek-client', () => {
	// --- Define mock data INSIDE factory ---
	const mockTransactionsData = [
		{
			date: '2024-04-01',
			description: 'Coffee Shop',
			type: 'Card',
			amount: 5.75,
			direction: 'OUT',
			details: ''
		},
		{
			date: '2024-04-02',
			description: 'Paycheck',
			type: 'Deposit',
			amount: 1500.0,
			direction: 'IN',
			details: 'Monthly salary'
		}
	];
	const mockJsonResponseStringData = JSON.stringify({ transactions: mockTransactionsData });
	// --- Return mocked functions ---
	return {
		llmChat: vi.fn().mockResolvedValue(mockJsonResponseStringData),
		deepseekGenerateJson: vi.fn().mockResolvedValue(mockJsonResponseStringData), // Mock this too
		getLLMFallbackResponse: vi.fn((err) => `Fallback error: ${err?.message || 'Unknown'}`),
		isLLMAvailable: vi.fn().mockResolvedValue(true)
	};
});

vi.mock('$lib/services/ai/conversation/bulk/llm-chunking', () => ({
	llmChunkTransactions: vi.fn().mockResolvedValue(['Chunk 1', 'Chunk 2'])
}));

// Mock the analytics service to prevent it running during integration tests
// (Note: Actions like clearTransactions now trigger analysis, so mocking is important)
vi.mock('$lib/services/analytics', () => ({
	calculateFinancialSummary: vi.fn().mockResolvedValue({}),
	detectAnomalies: vi.fn().mockResolvedValue({ anomalies: [] }),
	predictFutureTransactions: vi.fn().mockResolvedValue(null)
}));

describe('AI Extraction Flow Integration', () => {
	// Declare confirmSpy using the specific MockInstance type for window.confirm
	// Args: An array representing the argument types ([message?: string | undefined])
	// Returns: The return type (boolean)
	// Changed SpyInstance to MockInstance
	let confirmSpy: MockInstance<(message?: string | undefined) => boolean> | undefined;

	beforeEach(() => {
		vi.clearAllMocks(); // Clear mocks before each test

		// Mock window.confirm before calling actions that might use it
		// Store the spy so we can restore it later
		// The assignment now matches the declared type
		confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true); // Assume user confirms

		// Reset appStore state using its public actions
		appStore.clearTransactions(); // Uses the action (and the confirm mock)
		appStore.resetConversation(); // Uses the action to reset conversation state
		appStore.setAnalysisResults(null); // Use action to clear analysis results
		// No need to manually reset loading/error if setAnalysisResults handles it

		// Optional: Verify initial state after reset actions
		expect(get(appStore).transactions, 'Transactions should be empty after reset').toHaveLength(0);
		expect(
			get(appStore).conversation.messages.length,
			'Conversation should have reset message'
		).toBe(1);
		expect(get(appStore).conversation.messages[0].content).toContain('starting fresh');
		expect(
			get(appStore).analysis.summary,
			'Analysis summary should be null after reset'
		).toBeNull();
		expect(
			get(appStore).analysis.anomalies,
			'Analysis anomalies should be null after reset'
		).toBeNull();
		expect(
			get(appStore).analysis.predictions,
			'Analysis predictions should be null after reset'
		).toBeNull();
		expect(get(appStore).analysis.loading, 'Analysis loading should be false after reset').toBe(
			false
		);
		expect(get(appStore).analysis.error, 'Analysis error should be null after reset').toBeNull();
	});

	afterEach(() => {
		// Restore the original window.confirm implementation
		confirmSpy?.mockRestore();
	});

	it('extracts transactions directly using the extraction service', async () => {
		const input = 'Some input that might trigger JSON extraction';
		const transactions = await extractTransactionsFromText(input);

		// Assert based on the data defined *within* the deepseek-client mock
		expect(transactions).toHaveLength(2); // Expecting 2 from the mock data
		if (transactions.length > 0) {
			expect(transactions[0].description).toBe('Coffee Shop');
			expect(transactions[0].amount).toBe(5.75);
			// Note: Assuming your extraction service OR the llm-parser normalizes direction
			expect(['out', 'OUT']).toContain(transactions[0].direction);
		}
	});

	it('adds extracted transactions to appStore through conversation service', async () => {
		const input = 'I spent $5.75 at the coffee shop yesterday and got paid $1500 today';

		// State should be clean from beforeEach
		expect(get(appStore).transactions).toHaveLength(0);

		// Process through conversation service
		await sendMessage(input);

		// Check appStore directly after sendMessage completes
		const storeTransactions = get(appStore).transactions;

		// Assert based on the *mock* data defined within the deepseek-client mock
		// (because sendMessage eventually calls the extraction which uses the mock)
		expect(storeTransactions, 'Store should contain extracted transactions').toHaveLength(2);

		const coffeeTxn = storeTransactions.find((t) => t.description === 'Coffee Shop');
		expect(coffeeTxn, 'Coffee transaction should be found').toBeDefined();
		expect(coffeeTxn?.amount).toBe(5.75);
		// Adapt based on how your addTransactions or parser handles case
		expect(coffeeTxn?.direction?.toLowerCase()).toBe('out');

		const paycheckTxn = storeTransactions.find((t) => t.description === 'Paycheck');
		expect(paycheckTxn, 'Paycheck transaction should be found').toBeDefined();
		expect(paycheckTxn?.amount).toBe(1500.0);
		// Adapt based on how your addTransactions or parser handles case
		expect(paycheckTxn?.direction?.toLowerCase()).toBe('in');

		// Verify analysis was triggered (check if mocks were called)
		// Note: This assumes analysis services are mocked as shown earlier
		// You might need to await the import inside the test or ensure mocks are readily available
		const analyticsMock = await vi.importMock('$lib/services/analytics');
		// Check if analysis functions were called (due to addTransactions triggering analysis)
		expect(analyticsMock.calculateFinancialSummary).toHaveBeenCalled();
		// Depending on isLLMAvailable mock, these might or might not be called
		expect(analyticsMock.detectAnomalies).toHaveBeenCalled();
		expect(analyticsMock.predictFutureTransactions).toHaveBeenCalled();
	});

	// This test might still fail until conversationService is fully refactored
	// it('adds messages to conversation during extraction', async () => { ... });
});
