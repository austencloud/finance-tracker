<!-- src/lib/components/analysis/FinancialAnalysis.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/AppStore';
	import Tabs from '$lib/components/common/Tabs.svelte';
	import OverviewPanel from './OverviewPanel.svelte';
	import AnomaliesPanel from './AnomaliesPanel.svelte';
	import PredictionsPanel from './PredictionsPanel.svelte';
	import { isOllamaAvailable } from '$lib/services/ai/ollama-client';

	import type { FinancialSummary, Anomaly } from '$lib/services/analytics';

	const tabNames = ['Overview', 'Anomalies', 'Predictions'];
	let activeTab = 'Overview';

	let summary: FinancialSummary | null = null;
	let anomalies: { anomalies: Anomaly[] } = { anomalies: [] };
	let projectedNet: number | null = null;

	let loading = false;
	let llmAvailable = false;

	onMount(async () => {
		llmAvailable = await isOllamaAvailable();
	});

	$: if ($appStore.transactions.length > 0) {
		runAnalytics();
	} else {
		clearAnalytics();
	}

	async function runAnalytics() {
		loading = true;
		try {
			const analytics = await import('$lib/services/analytics');

			const raw = await analytics.calculateFinancialSummary($appStore.transactions);
			summary = {
				totalIncome: raw.income,
				totalExpenses: raw.expense,
				netCashflow: raw.net,
				savingsRate: raw.savingsRate
			};

			if (llmAvailable) {
				const rawAnoms = await analytics.detectAnomalies($appStore.transactions);
				const incoming: any[] = rawAnoms.anomalies as any[];
				anomalies = {
					anomalies: incoming.map((x, i) => ({
						index: x.index ?? i,
						risk: x.risk ?? 'unknown',
						reason: x.reason ?? 'No reason provided'
					}))
				};
			} else {
				anomalies = { anomalies: [] };
			}

			const pred = await analytics.predictFutureTransactions($appStore.transactions);
			projectedNet = pred?.projectedMonthlyNet ?? null;
		} catch (err) {
			console.error('Analytics failed', err);
		} finally {
			loading = false;
		}
	}

	function clearAnalytics() {
		summary = null;
		anomalies = { anomalies: [] };
		projectedNet = null;
	}

	function setTab(next: string) {
		activeTab = next;
	}
</script>

{#if $appStore.transactions.length > 0}
	<div class="analysis-container">
		<h3>Financial Analysis {loading ? '(Updating…)' : ''}</h3>
		<Tabs tabs={tabNames} active={activeTab} on:change={(e) => setTab(e.detail)} />
		<div class="tab-content">
			{#if activeTab === 'Overview' && summary}
				<OverviewPanel {summary} />
			{/if}
			{#if activeTab === 'Anomalies'}
				<AnomaliesPanel {anomalies} {llmAvailable} />
			{/if}
			{#if activeTab === 'Predictions'}
				<PredictionsPanel {projectedNet} />
			{/if}
		</div>
	</div>
{/if}

<style>
	.analysis-container {
		margin: 20px 0;
		background: #f8f9fa;
		padding: 20px;
		border-radius: 5px;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
	}
	h3 {
		margin: 0 0 15px;
		color: #2c3e50;
		border-bottom: 1px solid #eee;
		padding-bottom: 10px;
	}
	.tab-content {
		min-height: 200px;
	}
</style>
