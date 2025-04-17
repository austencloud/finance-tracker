<script lang="ts">
	import { transactionStore } from '$lib/stores/transactionStore';
	import { getCategoryTotalsInBase } from '$lib/stores/selectors';
	import type { CategoryTotals } from '$lib/types/types';
	import { formatCurrency } from '$lib/utils/helpers';
	import { BASE_CURRENCY } from '$lib/config/constants';

	let totalsPromise: Promise<CategoryTotals> = getCategoryTotalsInBase();

	$: if ($transactionStore) {
		totalsPromise = getCategoryTotalsInBase();
	}
</script>

{#await totalsPromise}
	<div class="category-totals">
		<h3>Category Totals</h3>
		<p>Calculating totals...</p>
	</div>
{:then totals}
	{#if totals && Object.keys(totals).filter((k) => totals[k] !== 0).length > 0}
		<div class="category-totals">
			<h3>Category Totals ({BASE_CURRENCY} Equivalent)</h3>
			<table>
				<thead>
					<tr>
						<th>Category</th>
						<th class="amount">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each Object.entries(totals) as [category, total]}
						{#if total !== 0}
							<tr>
								<td>{category}</td>
								<td class="amount {total < 0 ? 'expense-amount' : 'income-amount'}">
									{formatCurrency(Math.abs(total), BASE_CURRENCY)}
								</td>
							</tr>
						{/if}
					{/each}
					<tr class="grand-total">
						<td>Grand Total</td>
						<td class="amount">
							{formatCurrency(
								Object.values(totals).reduce((sum, val) => sum + val, 0),
								BASE_CURRENCY
							)}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	{:else}
		<div class="category-totals">
			<h3>Category Totals</h3>
			<p>No category totals to display.</p>
		</div>
	{/if}
{:catch error}
	<div class="category-totals error">
		<h3>Category Totals</h3>
		<p>Error calculating totals: {error instanceof Error ? error.message : 'Unknown error'}</p>
	</div>
{/await}

<style>
	.category-totals {
		margin: 20px 0;
		background-color: #f8f9fa;
		padding: 15px;
		border-radius: 5px;
		border: 1px solid #e9ecef;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}
	.category-totals p {
		padding: 10px;
		text-align: center;
		color: #6c757d;
	}
	.category-totals.error {
		border-left: 4px solid #e74c3c;
		background-color: #fdedec;
	}
	.category-totals.error p {
		color: #721c24;
		font-weight: bold;
	}
	h3 {
		margin-top: 0;
		margin-bottom: 15px;
		color: #34495e;
		border-bottom: 1px solid #eee;
		padding-bottom: 8px;
		font-size: 1.1em;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 10px;
	}
	th,
	td {
		padding: 10px 8px;
		text-align: left;
		border-bottom: 1px solid #e0e0e0;
		font-size: 0.95em;
	}
	th {
		background-color: #f8f9fa;
		font-weight: 600;
		font-size: 0.9em;
		color: #555;
	}
	.amount {
		text-align: right;
		font-family: 'Courier New', Courier, monospace;
	}
	.expense-amount {
		color: #c0392b;
		font-weight: 500;
	}
	.income-amount {
		color: #27ae60;
		font-weight: 500;
	}
	.grand-total {
		font-weight: bold;
		background-color: #eaf2f8;
		border-top: 2px solid #bdc3c7;
	}
	.grand-total td {
		background-color: #eaf2f8;
	}
</style>
