<script lang="ts">
	// Corrected import path
	import {
		conversationProgress,
		conversationStatus
	} from '$lib/services/ai/conversation/conversationDerivedStores';
</script>

<div class="conversation-header-embedded">
	<h4>AI Transaction Assistant</h4>
</div>

{#if $conversationProgress > 0}
	<div class="progress-container">
		<div class="progress-bar" style="width: {$conversationProgress}%"></div>
	</div>
{/if}
{#if $conversationStatus && $conversationStatus !== 'Thinking...'}
	<div class="status-message">{$conversationStatus}</div>
{/if}

<style>
	.conversation-header-embedded {
		padding: 10px 15px;
		background-color: #eaf2f8;
		color: #2c3e50;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #ddd;
		flex-shrink: 0;
	}
	.conversation-header-embedded h4 {
		margin: 0;
		font-size: 16px;
	}
	.progress-container {
		height: 4px;
		background-color: #e0e0e0;
		width: 100%;
		flex-shrink: 0;
	}
	.progress-bar {
		height: 100%;
		background-color: #2ecc71;
		transition: width 0.3s ease;
	}
	.status-message {
		font-size: 13px;
		color: #666;
		text-align: center;
		padding: 4px 10px;
		background-color: #f0f0f0;
		border-bottom: 1px solid #eee;
		flex-shrink: 0;
		line-height: 1.3;
	}
</style>
