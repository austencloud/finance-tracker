<script lang="ts">
	import LLMWithDataLayout from '$lib/components/input/LLMConversation/LLMWithDataLayout.svelte';
	import { onMount } from 'svelte';

	// Import needed derived stores & actions via adapters/index
	import {
		transactions,
		clearTransactions,
		isProcessing,
		categories // <-- IMPORT categories store
	} from '$lib/stores';

	// Import appStore directly for the selector method
	import { appStore } from '$lib/stores/AppStore';

	// Import services
	import { exportAsJson, generateHTMLReport } from '$lib/services/exporter';
	import { initialize } from '$lib/services/ai/conversation/conversationService';

	onMount(() => {
		initialize();
	});

	// Updated handler for report generation
	function handleGenerateReport() {
		const currentTotals = appStore.getCategoryTotals();
		// Pass the categories array value ($categories)
		generateHTMLReport($transactions, currentTotals, $categories);
	}
</script>

<main class="page-container">
	<h1>AI Transaction Entry</h1>

	{#if $isProcessing}
		<div class="processing-indicator">AI Assistant is working...</div>
	{/if}

	<LLMWithDataLayout />

	<div class="global-actions">
		<h2>Global Actions (Main List)</h2>
		<button
			on:click={() => exportAsJson($transactions)}
			disabled={$transactions.length === 0}
			class="action-button export-action"
		>
			Export JSON (All)
		</button>
		<button
			on:click={handleGenerateReport}
			disabled={$transactions.length === 0}
			class="action-button primary-action"
		>
			Generate HTML Report (All)
		</button>
		<button
			on:click={clearTransactions}
			disabled={$transactions.length === 0}
			class="action-button danger-action"
		>
			Clear All Transactions
		</button>
	</div>
</main>

<style>
	/* ... existing styles ... */
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

	.primary-action {
		background-color: #2ecc71;
	}
	.primary-action:hover:not(:disabled) {
		background-color: #27ae60;
	}

	.danger-action {
		background-color: #e74c3c;
	}
	.danger-action:hover:not(:disabled) {
		background-color: #c0392b;
	}

	.export-action {
		background-color: #f39c12;
	}
	.export-action:hover:not(:disabled) {
		background-color: #d35400;
	}
</style>
