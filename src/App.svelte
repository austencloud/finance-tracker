<script lang="ts">
	import LLMWithDataLayout from '$lib/components/input/LLMConversation/LLMWithDataLayout.svelte';
	import { onMount } from 'svelte';

	// --- REMOVE Adapter Imports ---
	// import {
	// 	transactions,
	// 	clearTransactions,
	// 	isProcessing,
	// 	categories
	// } from '$lib/stores';

	// --- USE Direct appStore Import ---
	import { appStore } from '$lib/stores/AppStore';
	import { get } from 'svelte/store'; // Import get if needed for non-reactive reads

	// Import services
	import { exportAsJson, generateHTMLReport } from '$lib/services/exporter';
	// Assuming 'initialize' uses appStore internally now
	import { initialize } from '$lib/services/ai/conversation/conversationService';

	onMount(() => {
		// Call service function (assumes it interacts with appStore)
		initialize();
	});

	// Updated handler for report generation using direct store access
	function handleGenerateReport() {
		// Read state directly using get() or rely on $appStore in template calls
		const currentTransactions = get(appStore).transactions; // Or use $appStore.transactions below
		const currentCategories = get(appStore).categories; // Or use $appStore.categories below
		const currentTotals = appStore.getCategoryTotals(); // Call selector method

		// Pass the actual arrays/objects
		generateHTMLReport(currentTransactions, currentTotals, currentCategories);
	}

	// Optional: If you need reactive updates *within the script*
	// $: console.log('AI Processing (direct):', $appStore.conversation.isProcessing);
</script>

<main class="page-container">
	<h1>AI Transaction Entry</h1>

	{#if $appStore.conversation.isProcessing}
		<div class="processing-indicator">AI Assistant is working...</div>
	{/if}

	<LLMWithDataLayout />

	<div class="global-actions">
		<h2>Global Actions (Main List)</h2>
		<button
			on:click={() => exportAsJson($appStore.transactions)}
			disabled={$appStore.transactions.length === 0 &&
				$appStore.conversation.extractedTransactions.length === 0}
			class="action-button export-action"
		>
			Export JSON (All)
		</button>
		<button
			on:click={handleGenerateReport}
			disabled={$appStore.transactions.length === 0 &&
				$appStore.conversation.extractedTransactions.length === 0}
			class="action-button primary-action"
		>
			Generate HTML Report (All)
		</button>
		<button
			on:click={appStore.clearTransactions}
			disabled={$appStore.transactions.length === 0 &&
				$appStore.conversation.extractedTransactions.length === 0}
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
