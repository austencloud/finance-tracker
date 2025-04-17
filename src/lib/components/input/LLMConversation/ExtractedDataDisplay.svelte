<script lang="ts">
	import { appStore } from '$lib/stores/AppStore';
	import type { Transaction, Category, SortField } from '$lib/stores/types';
	// *** Assuming formatCurrency is here or imported from utils ***
	import { formatCurrency } from '$lib/utils/helpers'; // Or your actual path
	import { onDestroy } from 'svelte';
	import { derived } from 'svelte/store';

	function handleItemClick(transactionId: string) {
		console.log(`[ExtractedDataDisplay] Item clicked: ${transactionId}`);
		appStore.selectTransactionForDetails(transactionId);
	}

	const sortedFilteredTransactions = derived(appStore, ($appStore) => {
		return appStore.getSortedFilteredTransactions();
	});
</script>

<div class="data-display-container">
	<h4>Transactions ({$sortedFilteredTransactions.length} matching filters)</h4>

	{#if $sortedFilteredTransactions.length === 0}{:else}
		<ul class="transaction-list">
			{#each $sortedFilteredTransactions as txn (txn.id)}
				<button
					type="button"
					class="transaction-item interactive"
					on:click={() => handleItemClick(txn.id)}
					aria-label="View details for transaction on {txn.date} for {txn.description} amount {formatCurrency(
						txn.amount,
						txn.currency // <-- Pass currency here too for accessibility
					)}"
				>
					<div class="date">{txn.date === 'unknown' ? 'Date?' : txn.date}</div>
					<div class="desc">{txn.description === 'unknown' ? 'Description?' : txn.description}</div>
					<div class="amount {txn.direction === 'out' ? 'expense-amount' : 'income-amount'}">
						{formatCurrency(txn.amount, txn.currency)}
						{txn.direction !== 'unknown' ? ` (${txn.direction})` : ''}
					</div>
				</button>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* Styles remain the same */
	.data-display-container {
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		padding: 15px 20px;
		background-color: #ffffff;
		height: 60vh;
		min-height: 400px;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}
	h4 {
		margin-top: 0;
		margin-bottom: 15px;
		color: #2980b9;
		border-bottom: 1px solid #eee;
		padding-bottom: 10px;
		font-size: 1.1em;
		font-weight: 600;
	}

	.transaction-list {
		list-style: none;
		padding: 0;
		margin: 0;
		flex-grow: 1;
	}
	.transaction-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		border-bottom: 1px solid #f0f0f0;
		padding: 12px 5px;
		font-size: 14px;
		font-family: inherit;
		color: inherit;
	}
	.transaction-item:last-child {
		border-bottom: none;
	}
	.transaction-item.interactive {
		cursor: pointer;
		transition: background-color 0.15s ease-in-out;
		border-radius: 4px;
	}
	.transaction-item.interactive:hover,
	.transaction-item.interactive:focus-visible {
		background-color: #eaf2f8;
		outline: 1px solid #aed6f1;
		outline-offset: -1px;
	}
	.date {
		font-size: 12px;
		color: #777;
		margin-bottom: 4px;
	}
	.desc {
		font-weight: 500;
		color: #333;
		margin-bottom: 4px;
		line-height: 1.3;
	}
	.amount {
		font-weight: bold;
		font-family: 'Courier New', Courier, monospace;
		font-size: 1.05em;
	}
	.amount.income-amount {
		color: #27ae60;
	}
	.amount.expense-amount {
		color: #c0392b;
	}

</style>
