<!-- src/lib/components/input/LLMConversation/LLMHeader.svelte -->
<script lang="ts">
	import { appStore } from '$lib/stores/AppStore';
	import ModelSelector from './ModelSelector.svelte';
</script>

<div class="conversation-header-embedded">
	<h4>AI Transaction Assistant</h4>
	<ModelSelector />
</div>

{#if $appStore.conversation.progress > 0}
	<div class="progress-container">
		<div class="progress-bar" style="width: {$appStore.conversation.progress}%"></div>
	</div>
{/if}

{#if $appStore.conversation.status && $appStore.conversation.status !== 'Thinking...'}
	<div class="status-message">{$appStore.conversation.status}</div>
{/if}

<style>
	.conversation-header-embedded {
		padding: 10px 15px;
		background-color: #eaf2f8; /* Light blue background */
		color: #2c3e50; /* Dark text */
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #ddd;
		flex-shrink: 0; /* Prevent shrinking */
	}
	.conversation-header-embedded h4 {
		margin: 0;
		font-size: 16px; /* Slightly larger */
		font-weight: 600; /* Medium weight */
	}
	.progress-container {
		height: 4px; /* Slim progress bar */
		background-color: #e0e0e0; /* Light grey background */
		width: 100%;
		flex-shrink: 0; /* Prevent shrinking */
		/* Optional: Subtle shadow or border */
		/* border-bottom: 1px solid #ddd; */
	}
	.progress-bar {
		height: 100%;
		background-color: #2ecc71; /* Green for progress */
		transition: width 0.3s ease; /* Smooth transition */
		border-radius: 0 2px 2px 0; /* Slightly rounded edge */
	}
	.status-message {
		font-size: 13px; /* Slightly smaller */
		color: #555; /* Medium grey text */
		text-align: center;
		padding: 5px 10px; /* Adjusted padding */
		background-color: #f8f9fa; /* Very light grey */
		border-bottom: 1px solid #eee; /* Lighter border */
		flex-shrink: 0; /* Prevent shrinking */
		line-height: 1.3;
		font-style: italic; /* Italicize status */
	}
</style>
