<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store'; // Keep get for handleGenerateReport

	// --- Import Separated Stores ---
	import { conversationStore } from '$lib/stores/conversationStore';
	import { transactionStore } from '$lib/stores/transactionStore';
	import { categories } from '$lib/stores/categoryStore'; // Import readable categories store
	import { bulkProcessingStore } from '$lib/stores/bulkProcessingStore'; // Import bulk store

	// --- Import Selectors ---
	import { getCategoryTotalsInBase } from '$lib/stores/selectors'; // Import async selector

	// --- Import Services ---
	import { generateHTMLReport } from '$lib/services/exporter'; // Adjust path if needed
	import { initialize } from '$lib/services/ai/conversation/conversationService'; // Adjust path
	import { initializeModelDiscovery } from '$lib/services/ai/model-discovery'; // Adjust path
	import { isOllamaAvailable } from '$lib/services/ai/ollama-client'; // Adjust path

	// --- Import Components ---
	import LLMWithDataLayout from '$lib/components/input/LLMConversation/LLMWithDataLayout.svelte';
	import FinancialAnalysis from '$lib/components/analysis/FinancialAnalysis.svelte';
	import TransactionModal from '$lib/components/transactions/TransactionModal.svelte';
	import BulkProcessingUI from '$lib/components/transactions/BulkProcessingUI.svelte';
	import BulkProcessingDebug from '$lib/components/transactions/BulkProcessingDebug.svelte';
	import GlobalCopyButton from '$lib/components/common/GlobalCopyButton.svelte';
	let showDebugTools = true; // Set to false for production

	onMount(async () => {
		// Initialize conversation service (doesn't interact with store directly here)
		initialize();

		// Initialize model discovery (might update uiStore internally if refactored)
		try {
			await initializeModelDiscovery();
		} catch (e) {
			console.warn('Model discovery failed:', e);
		}

		// Check LLM availability and update conversationStore
		try {
			const llmAvailable = await isOllamaAvailable();
			// --- Use conversationStore action ---
			conversationStore.setLLMAvailability(llmAvailable);
			if (!llmAvailable) {
				console.warn('No LLM available. App will have limited functionality.');
			}
		} catch (e) {
			console.warn('Error checking LLM availability:', e);
			// --- Use conversationStore action ---
			conversationStore.setLLMAvailability(false);
		}

		// Log the initial state of bulkProcessingStore for debugging
		console.log('[App] Initial bulkProcessingStore state:', get(bulkProcessingStore));

		// No need to trigger analysis here, FinancialAnalysis component handles it
	});

	// Handler for report generation - now async
	async function handleGenerateReport() {
		// --- Read state from specific stores using get() ---
		const currentTransactions = get(transactionStore);
		const currentCategories = get(categories); // Get value from readable store
		// --- Call async selector ---
		const currentTotals = await getCategoryTotalsInBase(); // Await the result

		// Call the report generator service
		generateHTMLReport(currentTransactions, currentTotals, currentCategories);
	}
</script>

<main class="page-container">
	<h1>AI Transaction Entry</h1>
	<div class="copy-btn-container">
		<GlobalCopyButton />
	</div>

	<LLMWithDataLayout />
	<BulkProcessingUI />
	<FinancialAnalysis />

	<div class="global-actions">
		<h2>Actions</h2>
		<button
			on:click={handleGenerateReport}
			disabled={$transactionStore.length === 0}
			class="action-button primary-action"
		>
			Generate HTML Report
		</button>
	</div>
</main>

<TransactionModal />

<style>
	.page-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 20px;
		font-family: Arial, sans-serif;
		color: #333;
	}

	h1 {
		text-align: center;
		color: #2c3e50;
		margin-bottom: 30px;
	}

	.copy-btn-container {
		display: flex;
		justify-content: center;
		margin: 8px 0 16px 0;
	}

	.global-actions {
		margin-top: 30px;
		padding-top: 20px;
		border-top: 1px solid #eee;
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}

	.global-actions h2 {
		margin: 0;
		margin-right: 15px;
		font-size: 1.1em;
		color: #34495e;
	}

	.action-button {
		padding: 8px 15px;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
		font-size: 14px;
	}

	.action-button:disabled {
		background-color: #95a5a6;
		cursor: not-allowed;
	}

	.primary-action {
		background-color: #2ecc71;
	}
	.primary-action:hover:not(:disabled) {
		background-color: #27ae60;
	}
</style>
