<script lang="ts">
	// Import the central application store
	import { appStore } from '$lib/stores/AppStore';
	import type { CategoryTotals } from '$lib/stores/types';
	// Import the type definition for CategoryTotals for better type checking

	// Declare a local variable to hold the category totals
	let totals: CategoryTotals = {};

	// Use a Svelte reactive declaration ($:)
	// This will automatically call appStore.getCategoryTotals() whenever
	// the appStore notifies its subscribers of an update (e.g., when transactions change).
	// The result is assigned to the local 'totals' variable, triggering UI updates.
	$: totals = appStore.getCategoryTotals();

</script>

{#if Object.keys(totals).length > 0}
	<div class="category-totals">
		<h3>Category Totals</h3>
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
							<td class="amount {category === 'Expenses' ? 'expense-amount' : 'income-amount'}">
								${Math.abs(total).toFixed(2)}
							</td>
						</tr>
					{/if}
				{/each}
				<tr class="grand-total">
					<td>Grand Total</td>
					<td class="amount">
						${Object.values(totals)
							.reduce((sum, val) => sum + val, 0)
							.toFixed(2)}
					</td>
				</tr>
			</tbody>
		</table>
	</div>
{/if}

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
