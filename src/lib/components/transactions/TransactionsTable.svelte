<!-- src/lib/components/transactions/TransactionsTable.svelte -->
<script lang="ts">
	import {
		sortedTransactions,
		loading,
		transactions,
		categories,
		deleteTransaction,
		selectedTransaction,
		showTransactionDetails,
		currentCategory
	} from '$lib/stores';
	import { toggleSort, sortField, sortDirection } from '$lib/stores';
</script>

{#if $sortedTransactions.length > 0}
	<div class="transactions-table">
		<table>
			<thead>
				<tr>
					<th class="sortable" on:click={() => toggleSort('date')}>
						Date {$sortField === 'date' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
					</th>
					<th class="sortable" on:click={() => toggleSort('description')}>
						Description {$sortField === 'description' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
					</th>
					<th class="amount sortable" on:click={() => toggleSort('amount')}>
						Amount {$sortField === 'amount' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
					</th>
					<th class="sortable" on:click={() => toggleSort('category')}>
						Category {$sortField === 'category' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
					</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each $sortedTransactions as transaction (transaction.id)}
					<tr class={transaction.category === 'Expenses' ? 'expense' : ''}>
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
							<span
								class={transaction.category === 'Expenses' ? 'expense-amount' : 'income-amount'}
							>
								${parseFloat(transaction.amount.toString().replace(/[$,]/g, '')).toFixed(2)}
							</span>
						</td>
						<td>
							<select
								bind:value={transaction.category}
								on:change={() => deleteTransaction(transaction.id)}
							>
								{#each categories as category}
									<option value={category}>{category}</option>
								{/each}
							</select>
						</td>
						<td class="actions-cell">
							<button
								class="details-button"
								on:click={() => {
									$selectedTransaction = transaction;
									$currentCategory = transaction.category;
									$showTransactionDetails = true;
								}}
							>
								Details
							</button>
							<button class="delete-button" on:click={() => deleteTransaction(transaction.id)}>
								Delete
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if $loading}
	<p>Loading transactions...</p>
{:else if $transactions.length === 0}
	<p>No transactions to display. Paste your data above and click "Process Transactions".</p>
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
