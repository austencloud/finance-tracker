<!-- src/App.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { transactions, categoryTotals, showSuccessMessage, clearTransactions } from './store';
	import { exportAsJson } from './utils/exporters';
	import { generateHTMLReport } from './utils/exporters';

	// Import components
	import InputForm from './components/InputForm.svelte';
	import Filters from './components/Filters.svelte';
	import TransactionsTable from './components/TransactionsTable.svelte';
	import TransactionModal from './components/TransactionModal.svelte';
	import CategoryTotals from './components/CategoryTotals.svelte';
	import FinancialAnalysis from './components/FinancialAnalysis.svelte';

	// Initialize the app
	onMount(() => {
		// You could add initialization logic here if needed
	});
</script>

<main class="app-container">
	<h1>Transaction Categorizer</h1>

	{#if $showSuccessMessage}
		<div class="success-message">Transactions successfully processed!</div>
	{/if}

	<InputForm />

	<div class="transactions-container">
		<div class="transactions-header">
			<h2>Transactions {$transactions.length > 0 ? `(${$transactions.length})` : ''}</h2>

			<!-- Actions -->
			<div class="actions">
				<button
					on:click={() => exportAsJson($transactions)}
					disabled={$transactions.length === 0}
					class="export-action"
				>
					Export JSON
				</button>
				<button
					on:click={() => generateHTMLReport($transactions, $categoryTotals)}
					disabled={$transactions.length === 0}
					class="primary-action"
				>
					Generate HTML Report
				</button>
				<button
					on:click={clearTransactions}
					disabled={$transactions.length === 0}
					class="danger-action"
				>
					Clear All
				</button>
			</div>
		</div>

		<CategoryTotals />
		
		<!-- Add the new Financial Analysis component -->
		<FinancialAnalysis />

		<Filters />

		<TransactionsTable />
	</div>

	<TransactionModal />
</main>

<style>
	.app-container {
		max-width: 1200px;
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

	h2 {
		color: #3498db;
		margin-top: 20px;
		margin-bottom: 15px;
		border-bottom: 1px solid #eee;
		padding-bottom: 5px;
	}

	.success-message {
		background-color: #d4edda;
		color: #155724;
		padding: 10px 15px;
		border-radius: 4px;
		margin-bottom: 20px;
		text-align: center;
	}

	.transactions-container {
		background-color: #f8f9fa;
		padding: 20px;
		border-radius: 5px;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
	}

	.transactions-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 20px;
	}

	.actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	button {
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	button:hover {
		background-color: #2980b9;
	}

	button:disabled {
		background-color: #95a5a6;
		cursor: not-allowed;
	}

	.primary-action {
		background-color: #2ecc71;
	}

	.primary-action:hover {
		background-color: #27ae60;
	}

	.danger-action {
		background-color: #e74c3c;
	}

	.danger-action:hover {
		background-color: #c0392b;
	}

	.export-action {
		background-color: #f39c12;
	}

	.export-action:hover {
		background-color: #d35400;
	}

	@media (max-width: 768px) {
		.transactions-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.actions {
			width: 100%;
			margin-top: 10px;
		}
	}
</style>