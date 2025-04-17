<script lang="ts">
	import type { Anomaly } from '$lib/services/analytics';
	import { transactionStore } from '$lib/stores/transactionStore';

	export let anomalies: { anomalies: Anomaly[] };
	export let llmAvailable: boolean;
</script>

{#if !llmAvailable}
	<div class="notice">Enable AI features for anomaly detection.</div>
{:else if !anomalies || !anomalies.anomalies || anomalies.anomalies.length === 0}
	<div class="notice">No significant anomalies detected in the transactions.</div>
{:else}
	<div class="anomalies-list">
		{#each anomalies.anomalies as a (a.index)}
			<div class="anomaly-card risk-{a.risk?.toLowerCase() ?? 'unknown'}">
				<div class="anomaly-header">
					<span class="risk-label">{a.risk ?? 'Unknown Risk'}</span>
					<span>
						Transaction: {$transactionStore[a.index]?.description || 'Unknown Description'}
						(Index: {a.index})
					</span>
				</div>
				<p>{a.reason ?? 'No reason provided.'}</p>
			</div>
		{/each}
	</div>
{/if}

<style>
	.notice {
		padding: 15px;
		background: #eaf2f8;
		border-left: 4px solid #3498db;
		border-radius: 4px;
		margin-top: 10px;
	}
	.anomalies-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 10px;
	}
	.anomaly-card {
		padding: 12px 15px;
		border-radius: 5px;
		background: white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		border-left: 4px solid #95a5a6;
		transition: box-shadow 0.2s ease-in-out;
	}
	.anomaly-card:hover {
		 box-shadow: 0 3px 6px rgba(0, 0, 0, 0.08);
	}
	.risk-low {
		border-color: #f39c12;
	}
	.risk-medium {
		border-color: #e67e22;
	}
	.risk-high {
		border-color: #e74c3c;
	}
	.anomaly-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		font-size: 0.9em;
		color: #555;
	}
	.risk-label {
		font-size: 0.8em;
		text-transform: uppercase;
		font-weight: bold;
		padding: 2px 6px;
		border-radius: 3px;
		color: white;
		background-color: #95a5a6;
	}
	.risk-low .risk-label { background-color: #f39c12; }
	.risk-medium .risk-label { background-color: #e67e22; }
	.risk-high .risk-label { background-color: #e74c3c; }

	.anomaly-card p {
		margin: 0;
		font-size: 0.95em;
		color: #333;
		line-height: 1.5;
	}
</style>
