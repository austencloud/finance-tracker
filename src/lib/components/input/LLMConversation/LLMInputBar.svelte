<script lang="ts">
	import { get } from 'svelte/store';
	import { onDestroy } from 'svelte';

	// Import service functions
	import {
		sendMessage,
		// generateSummary, // Removed - No longer triggered here
		// completeAndClear, // Removed - Obsolete
		abortAndClear // Service needs internal refactoring
	} from '$lib/services/ai/conversation/conversationService';

	// Import appStore directly
	import { appStore } from '$lib/stores/AppStore';

	// Transaction type import likely not needed here anymore
	// import type { Transaction } from '$lib/stores/types';

	let userInput = '';
	let submitTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let isSubmitting = false;

	// Starter response templates
	const starterResponses = [
		{ label: '💰 Income', text: 'I got paid $1,500 from my job on April 12' },
		{ label: '💸 Expense', text: 'I spent $42.50 at the grocery store yesterday' },
		{
			label: '📝 Multiple',
			text: 'I paid $800 for rent, $120 for electricity, and received $50 from a friend'
		},
		{ label: '❓ Question', text: 'What was my total income so far?' }
	];

	// Show/hide the starter response panel
	let showStarterPanel = false;

	// Function to use a starter response
	function useStarterResponse(text: string) {
		userInput = text;
		showStarterPanel = false; // Hide panel after selection
		// Automatically send the message
		setTimeout(() => debounceSubmit(), 0);
	}

	function debounceSubmit() {
		if (isSubmitting) {
			console.log('[LLMInputBar] Debounce: Submit already in progress.');
			return;
		}
		isSubmitting = true;
		handleSubmit();
		submitTimeoutId = setTimeout(() => {
			isSubmitting = false;
		}, 300);
	}

	// Function to toggle starter panel visibility
	function toggleStarterPanel() {
		showStarterPanel = !showStarterPanel;
	}

	function handleSubmit() {
		const currentInput = userInput.trim();
		// Read isProcessing directly from appStore state
		const processing = get(appStore).conversation.isProcessing;
		if (!currentInput || processing) {
			// console.warn('[LLMInputBar] Submit ignored: Input empty or AI processing.');
			isSubmitting = false; // Reset flag if submit is blocked
			if (submitTimeoutId) clearTimeout(submitTimeoutId);
			return;
		}
		sendMessage(currentInput); // Service handles adding/updating appStore.transactions
		userInput = '';
		showStarterPanel = false; // Hide panel after submission
		// isSubmitting will be reset by the timeout or if processing starts
	}

	// --- REMOVED handleComplete function ---

	// --- REMOVED requestSummary function ---

	// handleCancel function calls abortAndClear service
	// Note: abortAndClear service itself needs refactoring internally
	// to only clear messages/state, not extractedTransactions.
	function handleCancel() {
		abortAndClear();
		userInput = '';
		isSubmitting = false;
		showStarterPanel = false; // Hide panel after clearing
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	}

	onDestroy(() => {
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	});

	// --- REMOVED extractedCount reactive variable ---

	// Keep isProcessingValue for disabling input/button
	$: isProcessingValue = $appStore.conversation.isProcessing;
</script>

<div class="input-container">
	<form on:submit|preventDefault>
		{#if showStarterPanel}
			<div class="starter-panel">
				{#each starterResponses as response}
					<button
						type="button"
						class="starter-button"
						on:click={() => useStarterResponse(response.text)}
						disabled={isProcessingValue || isSubmitting}
					>
						{response.label}
					</button>
				{/each}
			</div>
		{/if}
		<textarea
			bind:value={userInput}
			placeholder="Describe transactions or ask questions..."
			rows="3"
			aria-label="Chat input"
			on:keydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					debounceSubmit();
				}
			}}
			disabled={isProcessingValue || isSubmitting}
		></textarea>
		<div class="button-container">
			<!-- Starter response toggle button -->
			<button
				type="button"
				class="starter-toggle-button"
				title="Show starter templates"
				on:click={toggleStarterPanel}
				disabled={isProcessingValue || isSubmitting}
			>
				{showStarterPanel ? 'Hide Templates' : 'Templates'}
			</button>

			<!-- Removed action-buttons div and Summary/Complete buttons -->
			<button
				type="button"
				class="cancel-button"
				title="Clear conversation history"
				on:click={handleCancel}
				disabled={isProcessingValue || isSubmitting}
			>
				Clear Chat
			</button>

			<button
				type="button"
				class="send-button"
				on:click={debounceSubmit}
				disabled={!userInput.trim() || isProcessingValue || isSubmitting}
			>
				Send {#if isProcessingValue || isSubmitting}<span class="loading-dots">...</span>{/if}
			</button>
		</div>
	</form>
</div>

<style>
	.input-container {
		padding: 10px 15px;
		border-top: 1px solid #ddd;
		background-color: #f8f9fa;
		flex-shrink: 0;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	textarea {
		resize: none;
		padding: 10px 15px;
		border: 1px solid #ccc;
		border-radius: 20px;
		font-family: inherit;
		font-size: 14px;
		line-height: 1.4;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	textarea:disabled {
		background-color: #e9ecef;
		cursor: not-allowed;
	}
	textarea:focus {
		outline: none;
		border-color: #3498db;
		box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
	}
	.button-container {
		display: flex;
		justify-content: space-between; /* Space between Clear and Send */
		align-items: center;
		flex-wrap: wrap; /* Allow wrapping if needed */
		gap: 8px;
	}
	/* Starter panel styles */
	.starter-panel {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
		padding: 8px;
		background: #f0f4f8;
		border-radius: 10px;
		border: 1px solid #d0d7de;
	}
	.starter-button {
		background-color: #34be82;
		color: white;
		padding: 8px 12px;
		border-radius: 15px;
		flex-grow: 1;
		min-width: 120px;
		text-align: center;
	}
	.starter-button:hover:not(:disabled) {
		background-color: #2c9e6d;
	}
	.starter-toggle-button {
		background-color: #8e44ad;
	}
	.starter-toggle-button:hover:not(:disabled) {
		background-color: #732d91;
	}
	/* Existing button styles */
	button {
		padding: 8px 15px;
		color: white;
		border: none;
		border-radius: 20px;
		cursor: pointer;
		font-size: 14px;
		transition:
			background-color 0.2s,
			opacity 0.2s;
		white-space: nowrap;
		line-height: 1.4;
		position: relative;
		overflow: hidden;
	}
	button:hover:not(:disabled) {
		filter: brightness(90%); /* Slightly darken on hover */
	}
	button:disabled {
		background-color: #bdc3c7 !important; /* Use important to override specifics */
		cursor: not-allowed;
		opacity: 0.7;
	}
	.loading-dots {
		display: inline-block;
		margin-left: 4px;
	}
	.cancel-button {
		background-color: #e74c3c;
	}
	.cancel-button:hover:not(:disabled) {
		background-color: #c0392b;
	}

	.send-button {
		background-color: #3498db;
		margin-left: auto;
		min-width: 80px;
	}
	.send-button:hover:not(:disabled) {
		background-color: #2980b9;
	}

	@media (max-width: 600px) {
		.button-container {
			gap: 10px;
		}
		.cancel-button {
			flex-grow: 1;
		}
		.send-button {
			margin-left: 0;
		}
		.starter-panel {
			flex-direction: column;
		}
		.starter-button {
			width: 100%;
		}
	}
</style>
