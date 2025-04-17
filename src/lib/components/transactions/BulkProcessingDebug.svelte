<script lang="ts">
	import { bulkProcessingStore } from '$lib/stores/bulkProcessingStore';

	// Helper function to manually activate bulk processing for testing
	function activateBulkProcessing() {
		console.log('[BulkProcessingDebug] Manually activating bulk processing');
		bulkProcessingStore.initializeChunks(['Test chunk 1', 'Test chunk 2', 'Test chunk 3']);
	}

	// Helper function to show bulk processing state
	function getBulkStateAsString() {
		return JSON.stringify(
			{
				isBulkProcessing: $bulkProcessingStore.isBulkProcessing,
				processingProgress: $bulkProcessingStore.processingProgress,
				chunkCount: $bulkProcessingStore.processingChunks.length
			},
			null,
			2
		);
	}
</script>

<div class="debug-panel">
	<h3>Bulk Processing Debug</h3>
	<div class="state-display">
		<pre>{getBulkStateAsString()}</pre>
	</div>
	<div class="actions">
		<button on:click={activateBulkProcessing}> Test Activate Bulk Processing </button>
		<button on:click={() => bulkProcessingStore.finalize()}> Test Reset Bulk State </button>
	</div>
</div>

<style>
	.debug-panel {
		margin-top: 20px;
		padding: 15px;
		border: 2px dashed #ff6b6b;
		border-radius: 8px;
		background-color: #fff5f5;
	}

	h3 {
		margin-top: 0;
		color: #e74c3c;
	}

	.state-display {
		background-color: #f8f9fa;
		padding: 10px;
		border-radius: 4px;
		margin-bottom: 10px;
		font-family: monospace;
		max-height: 200px;
		overflow: auto;
	}

	pre {
		margin: 0;
		white-space: pre-wrap;
	}

	.actions {
		display: flex;
		gap: 10px;
	}

	button {
		background-color: #e74c3c;
		color: white;
		border: none;
		padding: 8px 12px;
		border-radius: 4px;
		cursor: pointer;
	}

	button:hover {
		background-color: #c0392b;
	}
</style>
