<script lang="ts">
	import { onMount } from 'svelte';

	// --- Import Stores ---
	import { transactionStore } from '$lib/stores/transactionStore';
	import { analysisStore } from '$lib/stores/analysisStore';

	// --- Import Components ---
	import Tabs from '$lib/components/common/Tabs.svelte'; // Adjust path if needed
	import OverviewPanel from './OverviewPanel.svelte';
	import AnomaliesPanel from './AnomaliesPanel.svelte';
	import PredictionsPanel from './PredictionsPanel.svelte';

	// --- Import Services & Types ---
	import { isOllamaAvailable } from '$lib/services/ai/ollama-client'; // Adjust path if needed
	// Import types if needed for clarity or complex prop passing
	import type { FinancialSummary, AnomalyResult, PredictionResult } from '$lib/types/types'; // Adjust path if needed

	// --- Component State ---
	const tabNames = ['Overview', 'Anomalies', 'Predictions']; // Source data for tabs
	let activeTab = 'Overview'; // Local state for active tab name
	let llmAvailable = false; // Local state for LLM check result

	// --- Lifecycle ---
	onMount(async () => {
		try {
			llmAvailable = await isOllamaAvailable();
		} catch (e) {
			console.warn('FinancialAnalysis: LLM availability check failed.', e);
			llmAvailable = false;
		}
	});

	// --- Reactive Logic ---
	// Trigger analysis run whenever transactions change
	$: if ($transactionStore.length > 0) {
		console.log('[FinancialAnalysis] Transactions changed, triggering analysisStore.run()');
		analysisStore.run();
	} else {
		// Reset analysis state when transactions are empty
		console.log('[FinancialAnalysis] No transactions, resetting analysis state.');
		analysisStore.setResults(null);
		analysisStore.setError(null);
		analysisStore.setLoading(false);
	}

	// --- Local Functions ---
	// Updates the local activeTab state when the Tabs component dispatches a 'change' event
	function handleTabChange(event: CustomEvent<string>) {
		if (event.detail && tabNames.includes(event.detail)) {
			activeTab = event.detail;
		}
	}
</script>

{#if $transactionStore.length > 0}
	<div class="analysis-container">
		<h3>Financial Analysis {$analysisStore.loading ? '(Updating…)' : ''}</h3>

		<Tabs tabs={tabNames} active={activeTab} on:change={handleTabChange} />

		<div class="tab-content">
			{#if activeTab === 'Overview'}
				{#if $analysisStore.summary}
					<OverviewPanel summary={$analysisStore.summary} />
				{:else if !$analysisStore.loading}
					<p class="tab-placeholder">No summary data available.</p>
				{/if}
			{/if}

			{#if activeTab === 'Anomalies'}
				{#if $analysisStore.anomalies}
					<AnomaliesPanel anomalies={$analysisStore.anomalies} {llmAvailable} />
				{:else if !$analysisStore.loading}
					<p class="tab-placeholder">No anomaly data available.</p>
				{/if}
			{/if}

			{#if activeTab === 'Predictions'}
				{#if $analysisStore.predictions}
					<PredictionsPanel
						projectedNet={$analysisStore.predictions?.projectedMonthlyNet ?? null}
					/>
				{:else if !$analysisStore.loading}
					<p class="tab-placeholder">No prediction data available.</p>
				{/if}
			{/if}

			{#if $analysisStore.loading}
				<p class="tab-placeholder">Loading analysis...</p>
			{/if}
			{#if $analysisStore.error && !$analysisStore.loading}
				<p class="tab-placeholder error">Error loading analysis: {$analysisStore.error}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Styles remain the same */
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
		padding-top: 15px;
		position: relative;
	}
	.tab-placeholder {
		text-align: center;
		color: #6c757d;
		padding: 20px;
		font-style: italic;
	}
	.tab-placeholder.error {
		color: #e74c3c;
		font-weight: bold;
		font-style: normal;
	}
</style>
