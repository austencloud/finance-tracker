<script lang="ts">
	import { derived, get } from 'svelte/store';
	import { tick } from 'svelte';
	import { bulkProcessingStore } from '$lib/stores/bulkProcessingStore';
	import type { Transaction, ProcessingChunk } from '$lib/types/types';

	// Create a derived store for processing statistics
	const processingStats = derived(bulkProcessingStore, ($bulkProcessingStore) => {
		const chunks = $bulkProcessingStore.processingChunks;
		const successChunks = chunks.filter((c) => c.status === 'success'); // Filter successful chunks
		const errorChunks = chunks.filter((c) => c.status === 'error').length;
		const pendingChunks = chunks.filter(
			(c) => c.status === 'pending' || c.status === 'processing'
		).length;
		// Calculate count from successful chunks
		const transactionCount = successChunks.reduce((sum, chunk) => sum + chunk.transactionCount, 0);
		return {
			totalChunks: chunks.length,
			successChunks: successChunks.length,
			errorChunks,
			pendingChunks,
			transactionCount,
			isComplete: chunks.length > 0 && pendingChunks === 0
		};
	});

	// Function to close the UI
	function closeProcessingUI() {
		// Reset the bulk processing state
		bulkProcessingStore.finalize();
	}

	// Function to cancel processing
	function cancelProcessing() {
		if (
			confirm(
				'Are you sure you want to cancel processing? This cannot be undone for already added transactions.'
			)
		) {
			bulkProcessingStore.finalize();
		}
	}

	// Fast click animation state
	let buttonPressed = false;
	let buttonRipple = false;

	function animateDoneButton() {
		buttonPressed = true;
		buttonRipple = false;
		setTimeout(() => {
			buttonRipple = true;
			setTimeout(() => {
				buttonPressed = false;
				buttonRipple = false;
			}, 180);
		}, 5);
	}
</script>

{#if $bulkProcessingStore.isBulkProcessing}
	<div class="bulk-processing-container">
		<h3>Processing Large Transaction Set</h3>

		<div class="progress-header">
			<div class="progress-bar-container">
				<div class="progress-bar" style="width: {$bulkProcessingStore.processingProgress}%"></div>
			</div>
			<div class="progress-text">{$bulkProcessingStore.processingProgress}%</div>
		</div>

		<div class="stats-grid">
			<div class="stat-card">
				<div class="stat-title">Chunks Processed</div>
				<div class="stat-value">
					{$processingStats.successChunks + $processingStats.errorChunks} of {$processingStats.totalChunks}
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-title">Transactions Found</div>
				<div class="stat-value income">{$processingStats.transactionCount}</div>
			</div>
			<div class="stat-card">
				<div class="stat-title">Failed Chunks</div>
				<div class="stat-value {$processingStats.errorChunks > 0 ? 'expense' : ''}">
					{$processingStats.errorChunks}
				</div>
			</div>
		</div>

		<div class="chunks-list">
			<h4>Processing Status</h4>
			<div class="chunks-container">
				{#each $bulkProcessingStore.processingChunks as chunk (chunk.id)}
					<div class="chunk-item status-{chunk.status}">
						<div class="chunk-icon">
							{#if chunk.status === 'pending'}
								<span class="icon-pending">⏳</span>
							{:else if chunk.status === 'processing'}
								<span class="icon-processing">⚙️</span>
							{:else if chunk.status === 'success'}
								<span class="icon-success">✅</span>
							{:else if chunk.status === 'error'}
								<span class="icon-error">❌</span>
							{/if}
						</div>
						<div class="chunk-content">
							<div class="chunk-title">Chunk {chunk.id.split('-')[1]}: {chunk.text}</div>
							{#if chunk.status === 'success'}
								<div class="chunk-message success">
									Found {chunk.transactionCount} transaction{chunk.transactionCount !== 1
										? 's'
										: ''}
								</div>
							{:else if chunk.status === 'error'}
								<div class="chunk-message error">{chunk.message || 'Processing failed'}</div>
							{:else}
								<div class="chunk-message">{chunk.message || '...'}</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="processing-actions">
			{#if $processingStats.isComplete}
				<div class="completion-notice">
					<p>
						Processing complete! Found {$processingStats.transactionCount} transactions across {$processingStats.successChunks}
						successful chunks. Transactions have been added to the main list.
					</p>
					{#if $processingStats.errorChunks > 0}
						<p class="warning">
							Note: {$processingStats.errorChunks} chunk{$processingStats.errorChunks !== 1
								? 's'
								: ''} failed to process.
						</p>
					{/if}
				</div>

				<button
					class="primary-button {buttonPressed ? 'pressed' : ''}"
					on:click={() => {
						animateDoneButton();
						closeProcessingUI();
					}}
				>
					<span class="ripple" class:ripple-active={buttonRipple}></span>
					Done
				</button>
			{:else}
				<button class="cancel-button" on:click={cancelProcessing}> Cancel Processing </button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.bulk-processing-container {
		background-color: #f8f9fa;
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 20px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	h3 {
		margin-top: 0;
		color: #2c3e50;
		margin-bottom: 15px;
	}

	.progress-header {
		display: flex;
		align-items: center;
		margin-bottom: 20px;
	}

	.progress-bar-container {
		flex-grow: 1;
		height: 8px;
		background-color: #e9ecef;
		border-radius: 4px;
		margin-right: 10px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background-color: #3498db;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.progress-text {
		font-weight: bold;
		font-size: 14px;
		color: #2c3e50;
		width: 40px;
		text-align: right;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 15px;
		margin-bottom: 20px;
	}

	.stat-card {
		background-color: white;
		padding: 12px;
		border-radius: 6px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	.stat-title {
		font-size: 12px;
		color: #7f8c8d;
		margin-bottom: 5px;
	}

	.stat-value {
		font-size: 18px;
		font-weight: bold;
		color: #2c3e50;
	}

	.income {
		color: #27ae60;
	}

	.expense {
		color: #e74c3c;
	}

	.chunks-list {
		margin-bottom: 20px;
	}

	.chunks-list h4 {
		font-size: 14px;
		margin-bottom: 10px;
		color: #2c3e50;
	}

	.chunks-container {
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid #e9ecef;
		border-radius: 6px;
	}

	.chunk-item {
		display: flex;
		padding: 10px;
		border-bottom: 1px solid #e9ecef;
	}

	.chunk-item:last-child {
		border-bottom: none;
	}

	.status-processing {
		background-color: #eaf2f8;
	}

	.status-success {
		background-color: #f1f9f7;
	}

	.status-error {
		background-color: #fdf1f0;
	}

	.chunk-icon {
		margin-right: 10px;
		font-size: 16px;
	}

	.icon-processing {
		animation: spin 2s linear infinite;
		display: inline-block;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.chunk-content {
		flex-grow: 1;
	}

	.chunk-title {
		font-size: 14px;
		margin-bottom: 2px;
	}

	.chunk-message {
		font-size: 12px;
		color: #7f8c8d;
	}

	.chunk-message.success {
		color: #27ae60;
	}

	.chunk-message.error {
		color: #e74c3c;
	}

	.processing-actions {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.completion-notice {
		background-color: #eaf7f0;
		border-left: 4px solid #27ae60;
		padding: 12px;
		margin-bottom: 10px;
		border-radius: 4px;
	}

	.completion-notice p {
		margin: 0 0 8px 0;
		font-size: 14px;
	}

	.completion-notice p:last-child {
		margin-bottom: 0;
	}

	.warning {
		color: #e67e22;
	}

	button {
		padding: 10px 15px;
		border: none;
		border-radius: 4px;
		font-weight: bold;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.primary-button {
		background-color: #3498db;
		color: white;
		position: relative;
		transition:
			transform 0.09s cubic-bezier(0.4, 2, 0.6, 1),
			background 0.14s;
		will-change: transform;
		overflow: hidden;
	}

	.primary-button.pressed {
		transform: scale(0.94);
		background: #4fc3f7 !important;
	}

	.ripple {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 0;
		height: 0;
		background: rgba(255, 255, 255, 0.35);
		border-radius: 50%;
		pointer-events: none;
		transform: translate(-50%, -50%) scale(1);
		opacity: 0;
		transition: opacity 0.12s;
		z-index: 1;
	}

	.ripple-active {
		width: 180%;
		height: 180%;
		opacity: 1;
		animation: ripple-pop-fast 0.18s cubic-bezier(0.4, 2, 0.6, 1);
	}

	@keyframes ripple-pop-fast {
		0% {
			transform: translate(-50%, -50%) scale(0.2);
			opacity: 0.7;
		}
		60% {
			transform: translate(-50%, -50%) scale(1.1);
			opacity: 0.35;
		}
		100% {
			transform: translate(-50%, -50%) scale(1.3);
			opacity: 0;
		}
	}

	.cancel-button {
		background-color: #e74c3c;
		color: white;
	}

	.cancel-button:hover {
		background-color: #c0392b;
	}

	@media (max-width: 768px) {
		.stats-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
