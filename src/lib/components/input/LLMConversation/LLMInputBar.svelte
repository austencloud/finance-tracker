<script lang="ts">
	import { get } from 'svelte/store';
	import { onDestroy } from 'svelte';

	// Import service functions (assuming they use appStore internally)
	import {
		sendMessage,
		generateSummary,
		completeAndClear,
		abortAndClear
	} from '$lib/services/ai/conversation/conversationService';

	// --- REMOVE adapter import for addTransactions ---
	// import { addTransactions } from '$lib/stores';

	// --- Import appStore directly ---
	import { appStore } from '$lib/stores/AppStore'; // Ensure this is present

	import type { Transaction } from '$lib/stores/types';

	let userInput = '';
	let submitTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let isSubmitting = false;

	// debounceSubmit function... (no changes needed)
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

	// handleSubmit function... (no changes needed, uses service)
	function handleSubmit() {
		const currentInput = userInput.trim();
		const processing = get(appStore).conversation.isProcessing;
		if (!currentInput || processing) {
			// ... (error logging) ...
			isSubmitting = false;
			if (submitTimeoutId) clearTimeout(submitTimeoutId);
			return;
		}
		sendMessage(currentInput);
		userInput = '';
	}

	// handleComplete function... (Updated action call)
	function handleComplete() {
		if (get(appStore).conversation.isProcessing) return;
		const txns = completeAndClear(); // Service call
		if (txns?.length > 0) {
			// Check if txns is truthy and has length
			// --- Call appStore action directly ---
			appStore.addTransactions(txns);
		} else {
			console.warn('[LLMInputBar] completeAndClear service returned no transactions.');
		}
	}

	// requestSummary function... (no changes needed, uses service)
	function requestSummary() {
		if (get(appStore).conversation.isProcessing) return;
		generateSummary();
	}

	// handleCancel function... (no changes needed, uses service)
	function handleCancel() {
		abortAndClear();
		userInput = '';
		isSubmitting = false;
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	}

	onDestroy(() => {
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	});

	// Reactive variables deriving from appStore... (no changes needed)
	$: extractedCount = $appStore.conversation.extractedTransactions.length;
	$: isProcessingValue = $appStore.conversation.isProcessing;
</script>

<div class="input-container">
	<form on:submit|preventDefault>
		<textarea
			bind:value={userInput}
			placeholder="Describe transactions or ask questions..."
			rows="3"
			aria-label="Chat input"
			on:keydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					debounceSubmit(); // Use debounced submit
				}
			}}
			disabled={isProcessingValue || isSubmitting}
		></textarea>
		<div class="button-container">
			{#if extractedCount > 0}
				<div class="action-buttons">
					<button
						type="button"
						class="summary-button"
						on:click={requestSummary}
						disabled={isProcessingValue || isSubmitting}
						title="Generate a summary of extracted transactions"
					>
						View Summary ({extractedCount})
					</button>
					<button
						type="button"
						class="complete-button"
						on:click={handleComplete}
						disabled={isProcessingValue || isSubmitting}
						title="Add extracted transactions to the main list and clear chat"
					>
						Use {extractedCount} Transaction{extractedCount !== 1 ? 's' : ''}
					</button>
					<button
						type="button"
						class="cancel-button"
						title="Clear conversation and extracted data"
						on:click={handleCancel}
						disabled={isProcessingValue || isSubmitting}
					>
						Clear Chat
					</button>
				</div>
			{/if}
			<button
				type="button"
				on:click={debounceSubmit}
				disabled={!userInput.trim() || isProcessingValue || isSubmitting}
			>
				Send {#if isProcessingValue || isSubmitting}<span class="loading-dots">...</span>{/if}
			</button>
		</div>
	</form>
</div>

<style>
	/* Styles remain the same */
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
			box-shadow 0.2s; /* Added transition */
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
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	.action-buttons {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		flex-grow: 1; /* Allow action buttons to take space */
		justify-content: flex-start; /* Align action buttons left */
	}
	button {
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 20px;
		cursor: pointer;
		font-size: 14px;
		transition:
			background-color 0.2s,
			opacity 0.2s; /* Added opacity */
		white-space: nowrap;
		margin-top: 0; /* Reset margin */
		line-height: 1.4; /* Ensure consistent height */
		position: relative; /* For loading dots */
		overflow: hidden; /* Hide dots initially */
	}
	button:hover:not(:disabled) {
		background-color: #2980b9;
	}
	button:disabled {
		background-color: #bdc3c7;
		cursor: not-allowed;
		opacity: 0.7;
	}
	.loading-dots {
		/* Simple dots, improve if needed */
		display: inline-block;
		margin-left: 4px;
	}
	.summary-button {
		background-color: #9b59b6;
	}
	.summary-button:hover:not(:disabled) {
		background-color: #8e44ad;
	}
	.complete-button {
		background-color: #2ecc71;
	}
	.complete-button:hover:not(:disabled) {
		background-color: #27ae60;
	}
	.cancel-button {
		background-color: #e74c3c;
	}
	.cancel-button:hover:not(:disabled) {
		background-color: #c0392b;
	}
	/* Specific style for the main Send button */
	button[type='button']:last-child {
		/* Target the last button, assuming it's Send */
		margin-left: auto; /* Push Send button to the right */
		min-width: 80px;
		background-color: #3498db; /* Ensure it has the default blue */
	}
	button[type='button']:last-child:hover:not(:disabled) {
		background-color: #2980b9;
	}

	@media (max-width: 600px) {
		.button-container {
			flex-direction: column;
			align-items: stretch; /* Make buttons full width */
			gap: 10px; /* Add gap for stacked buttons */
		}
		.action-buttons {
			order: 2; /* Show action buttons below Send */
			justify-content: center; /* Center action buttons when stacked */
			width: 100%; /* Ensure action buttons container takes width */
		}
		.action-buttons button {
			flex-grow: 1; /* Allow action buttons to grow */
			text-align: center;
		}
		button[type='button']:last-child {
			/* Send button */
			order: 1; /* Show Send button first */
			margin-left: 0; /* Reset margin */
			width: 100%; /* Make send button full width */
		}
	}
</style>
