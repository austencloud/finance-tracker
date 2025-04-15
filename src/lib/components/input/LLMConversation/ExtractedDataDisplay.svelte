<script lang="ts">
	import { appStore } from '$lib/stores/AppStore';
	import type { Transaction, Category, SortField } from '$lib/stores/types';
	import { onDestroy } from 'svelte';
	import { derived } from 'svelte/store'; // *** Import derived ***

	// --- Local Helper Functions ---
	function formatCurrency(amount: number | string): string {
		const num = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount;
		if (isNaN(num)) {
			console.warn(`[formatCurrency] Invalid amount received: ${amount}`);
			return '$0.00';
		}
		return num.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function handleItemClick(transactionId: string) {
		console.log(`[ExtractedDataDisplay] Item clicked: ${transactionId}`);
		appStore.selectTransactionForDetails(transactionId);
	}

	// --- Reactive Derived Store ---
	// Create a derived store that automatically recalculates when appStore changes.
	// This replicates the logic from appStore.getSortedFilteredTransactions
	const sortedFilteredTransactions = derived(appStore, ($appStore) => {
		console.log('[ExtractedDataDisplay derived] Recalculating derived store...'); // Debug log
		const { transactions, filters } = $appStore;

		// Filtering Logic
		let filtered = transactions; // Start with all transactions
		// Filter by Category
		if (filters.category !== 'all') {
			filtered = transactions.filter((t) => t.category === filters.category);
		}
		// Filter by Search Term
		if (filters.searchTerm) {
			const term = filters.searchTerm.toLowerCase();
			filtered = filtered.filter(
				(t) =>
					(t.description || '').toLowerCase().includes(term) ||
					(t.date || '').toLowerCase().includes(term) ||
					(t.notes || '').toLowerCase().includes(term) ||
					(t.category || '').toLowerCase().includes(term) ||
					(t.type || '').toLowerCase().includes(term)
			);
		}

		// Sorting Logic
		// Use [...filtered] to create a shallow copy before sorting, preventing mutation of the filtered array
		const sorted = [...filtered].sort((a, b) => {
			let valueA: any, valueB: any;
			const field = filters.sortField as keyof Transaction; // Type assertion

			// Handle specific sorting logic for date and amount
			switch (field) {
				case 'amount':
					valueA = a.amount ?? 0; // Use nullish coalescing for safety
					valueB = b.amount ?? 0;
					break;
				case 'date':
					// Attempt to parse dates for comparison, fallback to string compare if invalid
					try {
						// Add T00:00:00 to avoid timezone issues during comparison
						const dateA = new Date(a.date + 'T00:00:00').getTime();
						const dateB = new Date(b.date + 'T00:00:00').getTime();
						// Treat invalid dates as 0 for sorting purposes, or use string comparison as fallback
						valueA = isNaN(dateA) ? (a.date === 'unknown' ? -Infinity : a.date) : dateA;
						valueB = isNaN(dateB) ? (b.date === 'unknown' ? -Infinity : b.date) : dateB;
						// If both are invalid dates, compare as strings
						if (typeof valueA === 'string' && typeof valueB === 'string') {
							// Standard string comparison
						} else if (typeof valueA !== 'number') {
							// Place invalid dates first/last consistently
							return filters.sortDirection === 'asc' ? -1 : 1;
						} else if (typeof valueB !== 'number') {
							return filters.sortDirection === 'asc' ? 1 : -1;
						}
					} catch {
						// Fallback to string comparison on any parsing error
						valueA = a.date;
						valueB = b.date;
					}
					break;
				case 'description':
				case 'category':
				case 'type':
				case 'direction':
				case 'notes':
				case 'id':
					valueA = (a[field] || '').toLowerCase();
					valueB = (b[field] || '').toLowerCase();
					break;
				default:
					// Fallback for any other potential fields (though unlikely with defined SortField type)
					valueA = a[field];
					valueB = b[field];
			}

			// Comparison logic
			const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
			return filters.sortDirection === 'asc' ? comparison : -comparison; // Apply direction
		});

		console.log('[ExtractedDataDisplay derived] Recalculation complete. Count:', sorted.length); // Debug log
		return sorted; // Return the final sorted and filtered array
	});

	// Debugging log (optional, keep if needed)
	$: {
		console.log(
			'[ExtractedDataDisplay reactive block] $appStore.transactions.length:',
			$appStore.transactions.length
		);
		console.log(
			'[ExtractedDataDisplay reactive block] $sortedFilteredTransactions length:',
			$sortedFilteredTransactions.length
		);
	}
</script>

<div class="data-display-container">
	<h4>Transactions ({$sortedFilteredTransactions.length} matching filters)</h4>

	{#if $sortedFilteredTransactions.length === 0}
		{#if $appStore.transactions.length === 0}
			<p class="placeholder">No transactions recorded yet...</p>
		{:else}
			<p class="placeholder">No transactions match current filters...</p>
		{/if}
	{:else}
		<ul class="transaction-list">
			{#each $sortedFilteredTransactions as txn (txn.id)}
				<button
					type="button"
					class="transaction-item interactive"
					on:click={() => handleItemClick(txn.id)}
					on:keydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') handleItemClick(txn.id);
					}}
					tabindex="0"
					title="Click to view/edit details for {txn.description}"
					aria-label="View details for transaction on {txn.date} for {txn.description} amount {formatCurrency(
						txn.amount
					)}"
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
	.amount.income-amount {
		color: #27ae60;
	}
	.amount.expense-amount {
		color: #c0392b;
	}
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
