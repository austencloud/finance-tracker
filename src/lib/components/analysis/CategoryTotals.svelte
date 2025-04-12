<!-- src/lib/components/analysis/CategoryTotals.svelte -->
<script lang="ts">
	import { categoryTotals } from '$lib/stores';
</script>

{#if Object.keys($categoryTotals).length > 0}
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
				{#each Object.entries($categoryTotals) as [category, total]}
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
						${Object.values($categoryTotals)
							.reduce((sum, val) => sum + val, 0)
							.toFixed(2)}
					</td>
				</tr>
			</tbody>
		</table>
	</div>
{/if}

<style>
	.category-totals {
		margin: 20px 0;
		background-color: #f8f9fa;
		padding: 15px;
		border-radius: 5px;
		border: 1px solid #e9ecef;
	}

	h3 {
		margin-top: 0;
		margin-bottom: 10px;
		color: #555;
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

	.amount {
		text-align: right;
	}

	.expense-amount {
		color: #e74c3c;
	}

	.income-amount {
		color: #27ae60;
	}

	.grand-total {
		font-weight: bold;
		background-color: #eaf2f8;
	}
</style>
