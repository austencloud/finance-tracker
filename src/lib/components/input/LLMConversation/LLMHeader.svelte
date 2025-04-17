<!-- src/lib/components/input/LLMConversation/LLMHeader.svelte -->
<script lang="ts">
	import { appStore } from '$lib/stores/AppStore';
	import ModelSelector from './ModelSelector.svelte';

	// Function to handle copying conversation content
	function copyConversation() {
		const messages = $appStore.conversation.messages;
		if (!messages || messages.length === 0) return;

		// Format messages for copying
		const formattedContent = messages
			.map((msg) => {
				const role = msg.role === 'user' ? 'You' : 'Assistant';
				return `${role}: ${msg.content}`;
			})
			.join('\n\n');

		// Copy to clipboard
		navigator.clipboard
			.writeText(formattedContent)
			.then(() => {
				showCopySuccess();
			})
			.catch((err) => {
				console.error('Failed to copy conversation:', err);
			});
	}

	// Show temporary success message
	let copySuccess = false;
	function showCopySuccess() {
		copySuccess = true;
		setTimeout(() => {
			copySuccess = false;
		}, 2000);
	}
</script>

<div class="conversation-header-embedded">
	<h4>AI Transaction Assistant</h4>
	<div class="header-controls">
		<button
			class="copy-button"
			on:click={copyConversation}
			aria-label="Copy conversation"
			title="Copy conversation to clipboard"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
				<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
			</svg>
			{#if copySuccess}
				<span class="copy-success">✓</span>
			{/if}
		</button>
	</div>
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
	.header-controls {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.copy-button {
		display: flex;
		align-items: center;
		background-color: transparent;
		border: 1px solid #2c3e50;
		border-radius: 4px;
		padding: 4px 8px;
		color: #2c3e50;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
	}
	.copy-button:hover {
		background-color: rgba(44, 62, 80, 0.1);
	}
	.copy-success {
		position: absolute;
		top: -5px;
		right: -5px;
		background-color: #2ecc71;
		color: white;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fade-in-out 2s ease;
	}
	@keyframes fade-in-out {
		0% {
			opacity: 0;
		}
		20% {
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
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
