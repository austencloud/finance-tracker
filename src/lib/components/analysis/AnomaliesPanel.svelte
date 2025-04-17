<script lang="ts">
	import type { Anomaly } from '$lib/services/analytics';
	import { appStore } from '$lib/stores/AppStore';
	export let anomalies: { anomalies: Anomaly[] };
	export let llmAvailable: boolean;
</script>

{#if !llmAvailable}
	<div class="notice">Enable AI for anomaly detection.</div>
{:else if anomalies.anomalies.length === 0}
	<div class="notice">No anomalies detected.</div>
{:else}
	<div class="anomalies-list">
		{#each anomalies.anomalies as a}
			<div class="anomaly-card risk-{a.risk}">
				<div class="anomaly-header">
					<span class="risk-label">{a.risk}</span>
					<span>
						Transaction #{a.index + 1}: {$appStore.transactions[a.index]?.description || 'Unknown'}
					</span>
				</div>
				<p>{a.reason}</p>
			</div>
		{/each}
	</div>
{/if}

<style>
	.notice {
		padding: 15px;
		background: #eaf2f8;
		border-left: 4px solid #3498db;
	}
	.anomalies-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.anomaly-card {
		padding: 12px;
		border-radius: 5px;
		background: white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		border-left: 4px solid #95a5a6;
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
	.risk-label {
		font-size: 0.8em;
		text-transform: uppercase;
		margin-right: 8px;
	}
</style>
