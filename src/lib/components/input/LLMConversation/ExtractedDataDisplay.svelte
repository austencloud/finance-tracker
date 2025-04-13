<script lang="ts">
	// Import the store holding the data we want to display
	import { extractedTransactions } from '$lib/services/ai/conversation';
	// Import a utility to format currency nicely
	import { formatCurrency } from '$lib/utils/currency';
    import { onDestroy } from 'svelte'; // Make sure onDestroy is imported

	// Subscribe to the store using Svelte's reactive syntax ($)
	// Whenever extractedTransactions updates, this 'transactions' variable will update,
	// and the component will re-render automatically.
	$: transactions = $extractedTransactions;
	const unsubscribe = extractedTransactions.subscribe((value) => {
		console.log('[DEBUG] ExtractedDataDisplay received store update:', JSON.stringify(value));
	});
</script>

<div class="data-display-container">
	<h4>Extracted Transactions ({transactions.length})</h4>

	{#if transactions.length === 0}
		<p class="placeholder">No transactions extracted yet...</p>
	{:else}
		<ul class="transaction-list">
			{#each transactions as txn (txn.id)}
				<li class="transaction-item">
					<div class="date">{txn.date === 'unknown' ? 'Date?' : txn.date}</div>
					<div class="desc">{txn.description === 'unknown' ? 'Description?' : txn.description}</div>
					<div class="amount {txn.direction === 'in' ? 'in' : 'out'}">
						{formatCurrency(txn.amount)}
						{txn.direction !== 'unknown' ? `(${txn.direction})` : ''}
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
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.data-display-container {
		border: 1px solid #ccc;
		border-radius: 5px;
		padding: 15px;
		background-color: #fff;
		height: 60vh; /* Match conversation height */
		min-height: 400px; /* Match conversation height */
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	h4 {
		margin-top: 0;
		margin-bottom: 15px;
		color: #2980b9;
		border-bottom: 1px solid #eee;
		padding-bottom: 10px;
	}

	.placeholder {
		color: #888;
		text-align: center;
		margin-top: 30px;
		font-style: italic;
	}

	.transaction-list {
		list-style: none;
		padding: 0;
		margin: 0;
		flex-grow: 1;
	}

	.transaction-item {
		border-bottom: 1px solid #f0f0f0;
		padding: 10px 0;
		font-size: 14px;
	}
	.transaction-item:last-child {
		border-bottom: none;
	}

	.date {
		font-size: 12px;
		color: #777;
		margin-bottom: 3px;
	}

	.desc {
		font-weight: 500;
		margin-bottom: 3px;
	}

	.amount {
		font-weight: bold;
	}
	.amount.in {
		color: #27ae60; /* Green for income */
	}
	.amount.out {
		color: #c0392b; /* Red for expense */
	}

	.notes,
	.type,
	.category {
		font-size: 12px;
		color: #555;
		margin-top: 4px;
	}
</style>
