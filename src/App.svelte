<script lang="ts">
	import LLMWithDataLayout from '$lib/components/input/LLMConversation/LLMWithDataLayout.svelte';
	// Import the Analysis component
	import FinancialAnalysis from '$lib/components/analysis/FinancialAnalysis.svelte';
	import { onMount } from 'svelte';

	// Import appStore directly
	import { appStore } from '$lib/stores/AppStore';
	import { get } from 'svelte/store';

	// Import necessary services
	import { generateHTMLReport } from '$lib/services/exporter';
	import { initialize } from '$lib/services/ai/conversation/conversationService';

	onMount(() => {
		initialize(); // Initialize conversation service
		// Trigger initial analysis if needed
		if (get(appStore).transactions.length > 0) {
			appStore.runFinancialAnalysis();
		}
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

<style>
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
		align-items: center; /* Center items vertically */
	}

	.global-actions h2 {
		margin: 0;
		margin-right: 15px; /* Space between title and buttons */
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

	/* Kept primary, removed others as buttons were removed */
	.primary-action {
		background-color: #2ecc71;
	}
	.primary-action:hover:not(:disabled) {
		background-color: #27ae60;
	}
</style>
