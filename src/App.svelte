<script lang="ts">
	import LLMWithDataLayout from '$lib/components/input/LLMConversation/LLMWithDataLayout.svelte';
	import FinancialAnalysis from '$lib/components/analysis/FinancialAnalysis.svelte';
	import TransactionModal from '$lib/components/transactions/TransactionModal.svelte'; // <-- IMPORT THE MODAL
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/AppStore';
	import { get } from 'svelte/store';
	import { generateHTMLReport } from '$lib/services/exporter';
	import { initialize } from '$lib/services/ai/conversation/conversationService';
	import { initializeModelDiscovery } from '$lib/services/ai/model-discovery';
	import { isOllamaAvailable } from '$lib/services/ai/ollama-client';
	

	onMount(async () => {
		initialize(); // Initialize conversation service

		// Try to discover available models
		try {
			await initializeModelDiscovery();
		} catch (e) {
			console.warn('Model discovery failed:', e);
		}

		// Check if any LLM is available
		try {
			const llmAvailable = await isOllamaAvailable();
			appStore.setLLMAvailability(llmAvailable); // Update the store
			if (!llmAvailable) {
				console.warn('No LLM available. App will have limited functionality.');
			}
		} catch (e) {
			console.warn('Error checking LLM availability:', e);
			appStore.setLLMAvailability(false);
		}

		// Trigger initial analysis if needed (Removed - FinancialAnalysis component handles this internally)
		// if (get(appStore).transactions.length > 0) {
		//  appStore.runFinancialAnalysis(); // This might be redundant if FinancialAnalysis runs itself
		// }
	});

	// Handler for report generation
	function handleGenerateReport() {
		const currentTransactions = get(appStore).transactions;
		const currentCategories = get(appStore).categories;
		const currentTotals = appStore.getCategoryTotals();
		generateHTMLReport(currentTransactions, currentTotals, currentCategories);
	}
</script>

<main class="page-container">
	<h1>AI Transaction Entry</h1>

	{#if $appStore.conversation.isProcessing}
		<div class="processing-indicator">AI Assistant is working...</div>
	{/if}

	<LLMWithDataLayout />
	<FinancialAnalysis />

	<div class="global-actions">
		<h2>Actions</h2>
		<button
			on:click={handleGenerateReport}
			disabled={$appStore.transactions.length === 0}
			class="action-button primary-action"
		>
			Generate HTML Report
		</button>
	</div>
</main>

<TransactionModal />

<style>
	/* Styles remain the same */
	.processing-indicator {
		text-align: center;
		padding: 5px;
		background-color: #eaf2f8;
		color: #3498db;
		border-radius: 4px;
		margin-bottom: 15px;
		font-style: italic;
	}

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
