<script lang="ts">
	export let title: string;
	export let value: string;
	export let variant: 'income' | 'expense' | '';
</script>

<div class="stat-card {variant}">
	<div class="stat-title">{title}</div>
	<div class="stat-value">{value}</div>
</div>

<style>
	.stat-card {
		background: white;
		border-radius: 5px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		padding: 15px;
		text-align: center;
	}
	.stat-title {
		font-size: 0.9em;
		color: #555;
		margin-bottom: 8px;
	}
	.stat-value {
		font-size: 1.5em;
		font-weight: bold;
	}
	.income .stat-value {
		color: #27ae60;
	}
	.expense .stat-value {
		color: #e74c3c;
	}
</style>
