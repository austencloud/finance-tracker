<script lang="ts">
	// --- Import appStore directly ---
	// This component now reads data from the central application store.
	import { appStore } from '$lib/stores/AppStore';
	// Import the Transaction type definition for type safety.
	import type { Transaction } from '$lib/stores/types';
	// onDestroy might be needed if you add subscriptions manually later, but not currently used.
	import { onDestroy } from 'svelte';

	// --- Local Helper Functions ---

	/**
	 * Formats a numeric amount or string into a USD currency string.
	 * @param amount The amount to format.
	 * @returns The formatted currency string (e.g., "$10.50"). Returns '$0.00' for invalid input.
	 */
	function formatCurrency(amount: number | string): string {
		// Ensure amount is a number, removing currency symbols and commas if it's a string.
		const num = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;
		// Handle cases where parsing fails or input is not a number.
		if (isNaN(num)) {
			console.warn(`[formatCurrency] Invalid amount received: ${amount}`);
			return '$0.00'; // Return a default value for invalid input.
		}
		// Use Intl.NumberFormat for locale-aware currency formatting.
		return num.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	/**
	 * Handles clicking on a transaction item.
	 * Calls the appStore action to select the transaction and show the details modal.
	 * @param transactionId The UUID of the clicked transaction.
	 */
	function handleItemClick(transactionId: string) {
		console.log(`[ExtractedDataDisplay] Item clicked: ${transactionId}`);
		// Trigger the store action to open the modal for the selected transaction.
		appStore.selectTransactionForDetails(transactionId);
	}

	// --- Reactive Variables ---

	// $: creates a reactive statement. This variable will automatically update
	// whenever the appStore notifies its subscribers of changes.
	// It calls the getSortedFilteredTransactions selector to get the list
	// based on the current filter/sort state in the appStore.
	$: transactions = appStore.getSortedFilteredTransactions();

	// *** DEBUGGING LOGS ***
	// This reactive block runs whenever appStore updates.
	$: {
		// Use JSON.stringify to get a snapshot of the array content for logging
        // Check the raw transactions array length and content directly from the store subscription
		console.log('[ExtractedDataDisplay] Store updated check. $appStore.transactions:', JSON.stringify($appStore.transactions));
        // Check the length specifically used in the template's #if condition
		console.log('[ExtractedDataDisplay] $appStore.transactions.length:', $appStore.transactions.length);
        // Check the derived list that is actually iterated over
		console.log('[ExtractedDataDisplay] Filtered/Sorted list (transactions variable):', JSON.stringify(transactions));
        console.log('[ExtractedDataDisplay] Filtered/Sorted list length:', transactions.length);
	}
	// *** END DEBUGGING LOGS ***

</script>

<div class="data-display-container">
	<h4>Transactions ({transactions.length} matching filters)</h4>

	{#if transactions.length === 0}
		{#if $appStore.transactions.length === 0}
			<p class="placeholder">No transactions recorded yet...</p>
		{:else}
			<p class="placeholder">No transactions match current filters...</p>
		{/if}
	{:else}
		<ul class="transaction-list">
			{#each transactions as txn (txn.id)}
				<button
					type="button"
					class="transaction-item interactive"
					on:click={() => handleItemClick(txn.id)}
					on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleItemClick(txn.id)}}
					tabindex="0"
					title="Click to view/edit details for {txn.description}"
					aria-label="View details for transaction on {txn.date} for {txn.description} amount {formatCurrency(txn.amount)}"
				>
					<div class="date">{txn.date === 'unknown' ? 'Date?' : txn.date}</div>
					<div class="desc">{txn.description === 'unknown' ? 'Description?' : txn.description}</div>
					<div class="amount {txn.direction === 'out' ? 'expense-amount' : 'income-amount'}">
						{formatCurrency(txn.amount)}
						{txn.direction !== 'unknown' ? ` (${txn.direction})` : ''}
					</div>
					{#if txn.notes}
						<div class="notes">Notes: {txn.notes}</div>
					{/if}
					{#if txn.type && txn.type !== 'unknown'}
						<div class="type">Type: {txn.type}</div>
					{/if}
					{#if txn.category && txn.category !== 'Other / Uncategorized'}
						<div class="category">Category: {txn.category}</div>
					{/if}
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
		box-shadow: 0 2px 4px rgba(0,0,0,0.05);
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
	.placeholder {
		color: #888;
		text-align: center;
		margin-top: 40px;
		font-style: italic;
		flex-grow: 1;
		display: flex;
		align-items: center;
		justify-content: center;
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
	.amount.income-amount { color: #27ae60; }
	.amount.expense-amount { color: #c0392b; }
	.notes,
	.type,
	.category {
		font-size: 12px;
		color: #555;
		margin-top: 5px;
		display: block;
	}
	.category {
		font-style: italic;
		color: #666;
	}
</style>
