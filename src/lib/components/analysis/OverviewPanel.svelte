<script lang="ts">
	import StatCard from '$lib/components/common/StatCard.svelte';
	import { formatCurrency } from '$lib/utils/helpers';
	export let summary: {
		totalIncome: number;
		totalExpenses: number;
		netCashflow: number;
		savingsRate: number;
	};
</script>

<div class="overview-grid">
	<StatCard title="Total Income" value={formatCurrency(summary.totalIncome)} variant="income" />
	<StatCard
		title="Total Expenses"
		value={formatCurrency(summary.totalExpenses)}
		variant="expense"
	/>
	<StatCard
		title="Net Cashflow"
		value={formatCurrency(summary.netCashflow)}
		variant={summary.netCashflow >= 0 ? 'income' : 'expense'}
	/>
	<StatCard
		title="Savings Rate"
		value={`${summary.savingsRate.toFixed(1)}%`}
		variant={summary.savingsRate >= 0 ? 'income' : 'expense'}
	/>
</div>

<style>
	.overview-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 15px;
		margin-bottom: 20px;
	}
</style>
