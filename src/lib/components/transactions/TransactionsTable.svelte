<script lang="ts">
	import { derived } from 'svelte/store';
	// Replace monolithic store imports with specific stores
	import { transactionStore } from '$lib/stores/transactionStore';
	import { filterStore } from '$lib/stores/filterStore';
	import { uiStore } from '$lib/stores/uiStore';
	import { categories } from '$lib/stores/categoryStore';
	import { sortedFilteredTransactions } from '$lib/stores/derivedStores';
	import type { Category, Transaction } from '$lib/types/types';

	// Handlers using the new specific stores
	function handleUpdateCategory(event: Event, transactionId: string) {
		const target = event.target as HTMLSelectElement;
		transactionStore.assignCategory(transactionId, target.value as Category);
	}

	function showDetails(transactionId: string) {
		uiStore.selectTransactionForDetails(transactionId);
	}
</script>

{#if $uiStore.loading}
	<p>Loading transactions...</p>
{:else if $sortedFilteredTransactions.length > 0}
	<div class="transactions-table">
		<table>
			<thead>
				<tr>
					<th class="sortable" on:click={() => filterStore.toggleSort('date')}>
						Date {$filterStore.sortField === 'date'
							? $filterStore.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th class="sortable" on:click={() => filterStore.toggleSort('description')}>
						Description {$filterStore.sortField === 'description'
							? $filterStore.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th class="amount sortable" on:click={() => filterStore.toggleSort('amount')}>
						Amount {$filterStore.sortField === 'amount'
							? $filterStore.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th class="sortable" on:click={() => filterStore.toggleSort('category')}>
						Category {$filterStore.sortField === 'category'
							? $filterStore.sortDirection === 'asc'
								? '↑'
								: '↓'
							: ''}
					</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each $sortedFilteredTransactions as transaction (transaction.id)}
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
								{#each $categories as category (category)}
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
								on:click={() => transactionStore.deleteById(transaction.id)}
							>
								Delete
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if $transactionStore.length === 0}
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
