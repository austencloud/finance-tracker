<script lang="ts">
	// --- Store Imports ---
	// import { appStore } from '$lib/stores/AppStore'; // REMOVE old monolithic store
	import { uiStore } from '$lib/stores/uiStore'; // ADD specific ui store
	import { sortedFilteredTransactions } from '$lib/stores/derivedStores'; // ADD derived store

	// --- Type Imports ---
	import type { Transaction, Category, SortField } from '$lib/types/types'; // Adjust path if needed

	// --- Helper Imports ---
	import { formatCurrency } from '$lib/utils/helpers'; // Adjust path if needed

	import { onMount } from 'svelte';
	let copySuccess = false;

	function copyTransactionsJson() {
		const json = JSON.stringify($sortedFilteredTransactions, null, 2);
		navigator.clipboard.writeText(json).then(() => {
			copySuccess = true;
			setTimeout(() => (copySuccess = false), 1500);
		});
	}

	// --- Component Logic ---

	/**
	 * Handles clicking on a transaction item.
	 * Calls the uiStore action to select the transaction for details view.
	 * @param transactionId - The ID of the clicked transaction.
	 */
	function handleItemClick(transactionId: string | null) {
		// Ensure we have a valid ID before calling the store action
		if (transactionId) {
			console.log(`[ExtractedDataDisplay] Item clicked: ${transactionId}`);
			// --- Call action on the specific uiStore ---
			uiStore.selectTransactionForDetails(transactionId);
		} else {
			console.warn('[ExtractedDataDisplay] Clicked item missing ID.');
		}
	}

	// --- REMOVE Local Derived Store Definition ---
	// The derived store is now imported and handles dependencies automatically
	// const sortedFilteredTransactions = derived(appStore, ($appStore) => {
	//     return appStore.getSortedFilteredTransactions();
	// });

	// No need for onDestroy as the derived store handles its own unsubscription
</script>

<div class="data-display-container">
	<div class="header-row">
		<h4>Transactions ({$sortedFilteredTransactions.length} matching filters)</h4>
		<button
			class="copy-json-btn"
			on:click={copyTransactionsJson}
			aria-label="Copy transactions as JSON"
			title="Copy all displayed transactions as JSON"
			type="button"
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path
					d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
				></path></svg
			>
			{#if copySuccess}
				<span class="copy-success">✓</span>
			{/if}
		</button>
	</div>

	{#if $sortedFilteredTransactions.length === 0}
		<p class="no-transactions-placeholder">No transactions match the current filters.</p>
	{:else}
		<ul class="transaction-list">
			{#each $sortedFilteredTransactions as txn (txn.id)}
				<button
					type="button"
					class="transaction-item interactive"
					on:click={() => handleItemClick(txn.id)}
					aria-label="View details for transaction on {txn.date} for {txn.description} amount {formatCurrency(
						txn.amount,
						txn.currency
					)}"
				>
					<div class="date">{txn.date === 'unknown' ? 'Date?' : txn.date}</div>
					<div class="desc">{txn.description === 'unknown' ? 'Description?' : txn.description}</div>
					<div class="amount {txn.direction === 'out' ? 'expense-amount' : 'income-amount'}">
						{formatCurrency(txn.amount, txn.currency)}
						{#if txn.direction && txn.direction !== 'unknown'}
							<span class="direction">({txn.direction})</span>
						{/if}
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
		height: 60vh; /* Consider using max-height or letting content define height */
		min-height: 400px;
		display: flex;
		flex-direction: column;
		overflow-y: auto; /* Enable scrolling */
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
		flex-shrink: 0; /* Prevent header from shrinking */
	}
	.no-transactions-placeholder {
		text-align: center;
		color: #aaa;
		margin-top: 20px;
		font-style: italic;
		flex-grow: 1; /* Allow placeholder to take space */
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.transaction-list {
		list-style: none;
		padding: 0;
		margin: 0;
		flex-grow: 1; /* Allow list to take remaining space */
		overflow-y: auto; /* Ensure list itself can scroll if needed, though container scrolls */
	}
	.transaction-item {
		display: block; /* Use block for button */
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		border-bottom: 1px solid #f0f0f0;
		padding: 12px 5px;
		font-size: 14px;
		font-family: inherit;
		color: inherit; /* Inherit text color */
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
		background-color: #eaf2f8; /* Light blue hover */
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
		color: #27ae60; /* Green */
	}
	.amount.expense-amount {
		color: #c0392b; /* Red */
	}
	.direction {
		font-size: 0.85em;
		font-weight: normal;
		margin-left: 5px;
		color: #6c757d; /* Grey */
		font-style: italic;
	}
	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0;
	}
	.copy-json-btn {
		background: none;
		border: 1px solid #2980b9;
		color: #2980b9;
		border-radius: 4px;
		padding: 4px 8px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
		position: relative;
		display: flex;
		align-items: center;
	}
	.copy-json-btn:hover {
		background: #eaf2f8;
		border-color: #145a8a;
	}
	.copy-success {
		position: absolute;
		top: -7px;
		right: -7px;
		background: #2ecc71;
		color: #fff;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		animation: fade-in-out 1.5s;
	}
	@keyframes fade-in-out {
		0% {
			opacity: 0;
		}
		10% {
			opacity: 1;
		}
		90% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
</style>
