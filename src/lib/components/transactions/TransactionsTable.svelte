<script lang="ts">
	import { derived } from 'svelte/store'; // Import derived
	import { appStore } from '$lib/stores/AppStore'; // Import the central store
	import type { Category, Transaction } from '$lib/types/types'; // Keep type imports

	// --- Local Derived Store for Sorted Transactions ---
	// Recreate the sorting/filtering logic reactively based on appStore
	const sortedTransactions = derived(appStore, ($appStore) => {
		// Use the selector method from the store
		// Note: This derived store re-runs whenever *any* part of appStore changes.
		// For complex apps, more granular derivations might be considered, but this is often fine.
		return appStore.getSortedFilteredTransactions();
	});

	// --- Handlers calling appStore actions ---
	function handleUpdateCategory(event: Event, transactionId: string) {
		const target = event.target as HTMLSelectElement;
		appStore.assignCategory(transactionId, target.value as Category);
	}

	function showDetails(transactionId: string) {
		appStore.selectTransactionForDetails(transactionId);
	}
</script>

{#if $appStore.ui.loading}
	<p>Loading transactions...</p>
{:else if $sortedTransactions.length > 0}
	<div class="transactions-table">
		<table>
			<thead>
				<tr>
					<th class="sortable" on:click={() => appStore.toggleSort('date')}>
						Date {$appStore.filters.sortField === 'date'
							? $appStore.filters.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th class="sortable" on:click={() => appStore.toggleSort('description')}>
						Description {$appStore.filters.sortField === 'description'
							? $appStore.filters.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th class="amount sortable" on:click={() => appStore.toggleSort('amount')}>
						Amount {$appStore.filters.sortField === 'amount'
							? $appStore.filters.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th class="sortable" on:click={() => appStore.toggleSort('category')}>
						Category {$appStore.filters.sortField === 'category'
							? $appStore.filters.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each $sortedTransactions as transaction (transaction.id)}
					<tr class={transaction.direction === 'out' ? 'expense' : ''}>
						<td>{transaction.date}</td>
						<td>
							<div class="description-cell">
								{transaction.description}
								{#if transaction.notes}
									<div class="transaction-notes">Note: {transaction.notes}</div>
								{/if}
							</div>
						</td>
						<td class="amount">
							<span class={transaction.direction === 'out' ? 'expense-amount' : 'income-amount'}>
								${Math.abs(transaction.amount).toFixed(2)}
							</span>
						</td>
						<td>
							<select
								value={transaction.category}
								on:change={(e) => handleUpdateCategory(e, transaction.id)}
							>
								{#each $appStore.categories as category (category)}
									<option value={category}>{category}</option>
								{/each}
							</select>
						</td>
						<td class="actions-cell">
							<button class="details-button" on:click={() => showDetails(transaction.id)}>
								Details
							</button>
							<button
								class="delete-button"
								on:click={() => appStore.deleteTransaction(transaction.id)}
							>
								Delete
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if $appStore.transactions.length === 0}
	<p>No transactions to display. Paste your data or use the AI Assistant.</p>
{:else}
	<p>No transactions match your filters.</p>
{/if}

<style>
	.transactions-table {
		width: 100%;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 15px;
	}

	th,
	td {
		padding: 10px;
		text-align: left;
		border-bottom: 1px solid #ddd;
	}

	th {
		background-color: #f8f9fa;
		font-weight: bold;
	}

	th.sortable {
		cursor: pointer;
	}

	th.sortable:hover {
		background-color: #e9ecef;
	}

	tr.expense {
		background-color: #ffebee;
	}

	tr:hover {
		background-color: #f5f5f5;
	}

	.amount {
		text-align: right;
	}

	.expense-amount {
		color: #e74c3c;
	}

	.income-amount {
		color: #27ae60;
	}

	select {
		padding: 5px;
		border-radius: 4px;
		border: 1px solid #ddd;
		width: 100%;
	}

	/* Description cell with notes */
	.description-cell {
		display: flex;
		flex-direction: column;
	}

	.transaction-notes {
		font-size: 0.8em;
		color: #777;
		margin-top: 5px;
	}

	/* Actions */
	.actions-cell {
		white-space: nowrap;
		display: flex;
		gap: 5px;
	}

	.details-button,
	.delete-button {
		padding: 4px 8px;
		font-size: 0.8em;
	}

	.details-button {
		background-color: #3498db;
	}

	.details-button:hover {
		background-color: #2980b9;
	}

	.delete-button {
		background-color: #e74c3c;
	}

	.delete-button:hover {
		background-color: #c0392b;
	}

	@media (max-width: 768px) {
		th,
		td {
			padding: 8px 5px;
		}

		.actions-cell {
			display: flex;
			flex-direction: column;
			gap: 5px;
		}

		.details-button,
		.delete-button {
			padding: 3px 6px;
			font-size: 0.7em;
		}
	}
</style>
