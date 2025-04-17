<!-- src/lib/components/analysis/PredictionsPanel.svelte -->
<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';
	export let projectedNet: number | null;
</script>

{#if projectedNet === null}
	<div class="notice">No projection available.</div>
{:else}
	<div class="predictions-grid">
		<div class="pred-card">
			<div class="pred-title">Projected Monthly Net</div>
			<div class="pred-value {projectedNet >= 0 ? 'income' : 'expense'}">
				{formatCurrency(projectedNet)}
			</div>
		</div>
	</div>
{/if}

<style>
	.notice {
		padding: 15px;
		background: #eaf2f8;
		border-left: 4px solid #3498db;
	}
	.predictions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 12px;
	}
	.pred-card {
		background: #f8f9fa;
		padding: 12px;
		border-radius: 5px;
		text-align: center;
	}
	.pred-title {
		font-size: 0.9em;
		color: #555;
		margin-bottom: 6px;
	}
	.pred-value {
		font-size: 1.2em;
		font-weight: bold;
	}

</style>
