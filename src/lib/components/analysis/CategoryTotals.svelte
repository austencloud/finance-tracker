<script lang="ts">
	import { appStore } from '$lib/stores/AppStore';
	import type { CategoryTotals } from '$lib/types/types';
	import { formatCurrency } from '$lib/utils/helpers'; // Import formatter
	import { BASE_CURRENCY } from '$lib/config/constants'; // Import base currency

	// Remove reactive statement: let totals: CategoryTotals = {};
	// Remove reactive statement: $: totals = appStore.getCategoryTotals();

	// Call the async function directly for the await block
	let totalsPromise = appStore.getCategoryTotals(); // This is now a Promise

	// Re-run when transactions change
	$: if ($appStore.transactions) {
		totalsPromise = appStore.getCategoryTotals();
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
		<p>Error calculating totals: {error.message}</p>
	</div>
{/await}

<style>
	/* Styling for the category totals container */
	.category-totals {
		margin: 20px 0;
		background-color: #f8f9fa; /* Light background */
		padding: 15px;
		border-radius: 5px; /* Rounded corners */
		border: 1px solid #e9ecef; /* Subtle border */
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); /* Subtle shadow */
	}
	.category-totals p {
		padding: 10px;
	}
	.category-totals.error {
		border-left: 4px solid #e74c3c;
		background-color: #fdedec;
	}
	/* Styling for the heading */
	h3 {
		margin-top: 0;
		margin-bottom: 15px; /* Increased bottom margin */
		color: #34495e; /* Darker heading color */
		border-bottom: 1px solid #eee; /* Separator line */
		padding-bottom: 8px;
	}

	/* Basic table styling */
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 15px;
	}

	/* Table header and cell styling */
	th,
	td {
		padding: 12px 10px; /* Increased padding */
		text-align: left;
		border-bottom: 1px solid #e0e0e0; /* Lighter border */
	}

	/* Table header specific styling */
	th {
		background-color: #f8f9fa;
		font-weight: 600; /* Slightly bolder */
		font-size: 0.9em;
		color: #555;
	}

	/* Right-align amount columns */
	.amount {
		text-align: right;
		font-family: 'Courier New', Courier, monospace; /* Monospace font for numbers */
	}

	/* Styling for expense amounts (red color) */
	.expense-amount {
		color: #c0392b; /* Slightly darker red */
		font-weight: 500;
	}

	/* Styling for income amounts (green color) */
	.income-amount {
		color: #27ae60; /* Standard green */
		font-weight: 500;
	}

	/* Styling for the grand total row */
	.grand-total {
		font-weight: bold;
		background-color: #eaf2f8; /* Light blue background */
		border-top: 2px solid #bdc3c7; /* Stronger top border */
	}

	/* Ensure the grand total amount cell also gets the background */
	.grand-total td {
		background-color: #eaf2f8;
	}
</style>
