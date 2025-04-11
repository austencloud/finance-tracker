<!-- src/components/FinancialAnalysis.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { transactions } from '../store';
	import {
		calculateFinancialSummary,
		detectAnomalies,
		predictFutureTransactions
	} from '../utils/math-processor';
	import { isLLMAvailable } from '../utils/llm';

	let summary: any = null;
	let anomalies: any = { anomalies: [] };
	let predictions: any = null;
	let loading = false;
	let activeTab = 'overview';
	let llmAvailable = false;

	// Check if LLM is available
	onMount(async () => {
		llmAvailable = await isLLMAvailable();
	});

	// Update analyses when transactions change
	$: if ($transactions.length > 0) {
		updateAnalyses();
	} else {
		summary = null;
		anomalies = { anomalies: [] };
		predictions = null;
	}

	async function updateAnalyses() {
		if ($transactions.length === 0) return;

		loading = true;

		try {
			// Calculate financial summary
			summary = await calculateFinancialSummary($transactions);

			if (llmAvailable) {
				// Run anomaly detection
				anomalies = await detectAnomalies($transactions);

				// Predict future transactions
				predictions = await predictFutureTransactions($transactions);
			}
		} catch (error) {
			console.error('Error updating analyses:', error);
		} finally {
			loading = false;
		}
	}

	function setActiveTab(tab: string) {
		activeTab = tab;
	}

	// Format currency for display
	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}
</script>

{#if $transactions.length > 0}
	<div class="analysis-container">
		<h3>Financial Analysis {loading ? '(Updating...)' : ''}</h3>

		<div class="tabs">
			<button class:active={activeTab === 'overview'} on:click={() => setActiveTab('overview')}>
				Overview
			</button>
			<button
				class:active={activeTab === 'anomalies'}
				on:click={() => setActiveTab('anomalies')}
				class:disabled={!llmAvailable}
			>
				Anomaly Detection
			</button>
			<button
				class:active={activeTab === 'predictions'}
				on:click={() => setActiveTab('predictions')}
			>
				Predictions
			</button>
		</div>

		<div class="tab-content">
			{#if activeTab === 'overview' && summary}
				<div class="overview-tab">
					<div class="stats-grid">
						<div class="stat-card">
							<div class="stat-title">Total Income</div>
							<div class="stat-value income">{formatCurrency(summary.totalIncome)}</div>
						</div>
						<div class="stat-card">
							<div class="stat-title">Total Expenses</div>
							<div class="stat-value expense">{formatCurrency(summary.totalExpenses)}</div>
						</div>
						<div class="stat-card">
							<div class="stat-title">Net Cashflow</div>
							<div class="stat-value {summary.netCashflow >= 0 ? 'income' : 'expense'}">
								{formatCurrency(summary.netCashflow)}
							</div>
						</div>
						<div class="stat-card">
							<div class="stat-title">Savings Rate</div>
							<div class="stat-value {summary.savingsRate >= 0 ? 'income' : 'expense'}">
								{summary.savingsRate.toFixed(1)}%
							</div>
						</div>
					</div>

					{#if summary.analysis && llmAvailable}
						<div class="ai-analysis">
							<h4>AI Analysis</h4>
							<p>{summary.analysis}</p>
						</div>
					{:else if !llmAvailable}
						<div class="llm-notice">
							<p>Enable the AI features to get personalized financial analysis.</p>
						</div>
					{/if}
				</div>
			{/if}

			{#if activeTab === 'anomalies' && llmAvailable}
				<div class="anomalies-tab">
					{#if anomalies.anomalies.length > 0}
						<div class="anomalies-list">
							<h4>Potential Issues Detected</h4>
							{#each anomalies.anomalies as anomaly}
								<div class="anomaly-card risk-{anomaly.risk}">
									<div class="anomaly-header">
										<span class="risk-label">{anomaly.risk}</span>
										<span class="anomaly-transaction">
											Transaction #{anomaly.index}:
											{$transactions[anomaly.index]?.description || 'Unknown transaction'}
										</span>
									</div>
									<p class="anomaly-reason">{anomaly.reason}</p>
								</div>
							{/each}
						</div>
					{:else}
						<div class="no-anomalies">
							<p>No anomalies detected in your transactions.</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'anomalies' && !llmAvailable}
				<div class="llm-required">
					<p>Anomaly detection requires AI features to be enabled.</p>
				</div>
			{/if}

			{#if activeTab === 'predictions' && predictions}
				<div class="predictions-tab">
					<div class="prediction-header">
						<h4>Monthly Predictions</h4>
						<span class="reliability-badge reliability-{predictions.reliability}">
							{predictions.reliability} reliability
						</span>
					</div>

					<p class="prediction-message">{predictions.message}</p>

					<div class="prediction-cards">
						<div class="prediction-card">
							<div class="prediction-title">Predicted Monthly Income</div>
							<div class="prediction-value income">
								{formatCurrency(predictions.predictedIncome)}
							</div>
						</div>
						<div class="prediction-card">
							<div class="prediction-title">Predicted Monthly Expenses</div>
							<div class="prediction-value expense">
								{formatCurrency(predictions.predictedExpenses)}
							</div>
						</div>
						<div class="prediction-card">
							<div class="prediction-title">Projected Monthly Savings</div>
							<div
								class="prediction-value {predictions.predictedIncome -
									predictions.predictedExpenses >=
								0
									? 'income'
									: 'expense'}"
							>
								{formatCurrency(predictions.predictedIncome - predictions.predictedExpenses)}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.analysis-container {
		margin: 20px 0;
		background-color: #f8f9fa;
		padding: 20px;
		border-radius: 5px;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
	}

	h3 {
		margin-top: 0;
		margin-bottom: 20px;
		color: #2c3e50;
		border-bottom: 1px solid #eee;
		padding-bottom: 10px;
	}

	.tabs {
		display: flex;
		gap: 10px;
		margin-bottom: 20px;
		border-bottom: 1px solid #ddd;
		padding-bottom: 10px;
	}

	.tabs button {
		padding: 8px 15px;
		background-color: #f8f9fa;
		color: #555;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tabs button.active {
		background-color: #3498db;
		color: white;
		border-color: #3498db;
	}

	.tabs button:hover:not(.active):not(.disabled) {
		background-color: #eee;
	}

	.tabs button.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 15px;
		margin-bottom: 20px;
	}

	.stat-card {
		background-color: white;
		border-radius: 5px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
		padding: 15px;
	}

	.stat-title {
		font-size: 14px;
		color: #7f8c8d;
		margin-bottom: 5px;
	}

	.stat-value {
		font-size: 20px;
		font-weight: bold;
	}

	.income {
		color: #27ae60;
	}

	.expense {
		color: #e74c3c;
	}

	.ai-analysis {
		background-color: white;
		border-radius: 5px;
		padding: 15px;
		margin-top: 20px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.ai-analysis h4 {
		margin-top: 0;
		color: #3498db;
		margin-bottom: 10px;
	}

	.llm-notice {
		background-color: #eaf2f8;
		border-left: 4px solid #3498db;
		padding: 15px;
		margin-top: 20px;
	}

	.anomalies-list {
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	.anomaly-card {
		background-color: white;
		border-radius: 5px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
		padding: 15px;
		border-left: 4px solid #95a5a6;
	}

	.anomaly-card.risk-low {
		border-left-color: #f39c12;
	}

	.anomaly-card.risk-medium {
		border-left-color: #e67e22;
	}

	.anomaly-card.risk-high {
		border-left-color: #e74c3c;
	}

	.anomaly-header {
		display: flex;
		align-items: center;
		margin-bottom: 10px;
	}

	.risk-label {
		font-size: 12px;
		padding: 2px 6px;
		border-radius: 3px;
		text-transform: uppercase;
		font-weight: bold;
		margin-right: 10px;
	}

	.risk-low {
		background-color: #fff3cd;
		color: #876400;
	}

	.risk-medium {
		background-color: #ffe5d0;
		color: #804500;
	}

	.risk-high {
		background-color: #f8d7da;
		color: #721c24;
	}

	.anomaly-transaction {
		font-weight: bold;
	}

	.anomaly-reason {
		margin: 0;
		color: #555;
	}

	.no-anomalies,
	.llm-required {
		background-color: #eaf2f8;
		border-radius: 5px;
		padding: 20px;
		text-align: center;
		color: #3498db;
	}

	.predictions-tab {
		background-color: white;
		border-radius: 5px;
		padding: 20px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.prediction-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 15px;
	}

	.prediction-header h4 {
		margin: 0;
		color: #2c3e50;
	}

	.reliability-badge {
		font-size: 12px;
		padding: 3px 8px;
		border-radius: 20px;
		text-transform: capitalize;
	}

	.reliability-none {
		background-color: #f8d7da;
		color: #721c24;
	}

	.reliability-low {
		background-color: #fff3cd;
		color: #876400;
	}

	.reliability-medium {
		background-color: #d1ecf1;
		color: #0c5460;
	}

	.reliability-high {
		background-color: #d4edda;
		color: #155724;
	}

	.prediction-message {
		color: #7f8c8d;
		font-style: italic;
		margin-bottom: 20px;
	}

	.prediction-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 15px;
	}

	.prediction-card {
		background-color: #f8f9fa;
		border-radius: 5px;
		padding: 15px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	.prediction-title {
		font-size: 14px;
		color: #7f8c8d;
		margin-bottom: 8px;
	}

	.prediction-value {
		font-size: 18px;
		font-weight: bold;
	}

	@media (max-width: 768px) {
		.stats-grid,
		.prediction-cards {
			grid-template-columns: 1fr;
		}

		.tabs {
			flex-wrap: wrap;
		}
	}
</style>
