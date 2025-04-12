<!-- src/lib/components/input/LLMConversation/LLMInputBar.svelte -->
<script lang="ts">
	import { get } from 'svelte/store';
	import {
		isProcessing,
		conversationStatus,
		extractedTransactions,
		sendUserMessage,
		generateSummary,
		completeConversation,
		abortConversation
	} from '$lib/services/ai/conversation';
	import { addTransactions } from '$lib/stores';

	let userInput = '';

	function handleSubmit() {
		if (!userInput.trim() || get(isProcessing)) return;
		sendUserMessage(userInput);
		userInput = '';
	}

	function handleComplete() {
		if (get(isProcessing)) return;
		const txns = completeConversation();
		if (txns.length > 0) {
			addTransactions(txns);
		}
	}

	function requestSummary() {
		if (get(isProcessing)) return;
		generateSummary();
	}

	function handleCancel() {
		abortConversation();
	}

	// We track how many partial transactions have been extracted
	$: extractedCount = get(extractedTransactions).length;
</script>

<div class="input-container">
	<form on:submit|preventDefault={handleSubmit}>
		<textarea
			bind:value={userInput}
			placeholder="Describe transactions or ask questions..."
			rows="3"
			aria-label="Chat input"
			on:keydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					handleSubmit();
				}
			}}
			disabled={$isProcessing}
		></textarea>
		<div class="button-container">
			{#if extractedCount > 0}
				<div class="action-buttons">
					<button
						type="button"
						class="summary-button"
						on:click={requestSummary}
						disabled={$isProcessing}
					>
						View Summary ({extractedCount})
					</button>
					<button
						type="button"
						class="complete-button"
						on:click={handleComplete}
						disabled={$isProcessing}
					>
						Use {extractedCount} Transaction{extractedCount !== 1 ? 's' : ''}
					</button>
					<button
						type="button"
						class="cancel-button"
						title="Clear conversation and extracted data"
						on:click={handleCancel}
					>
						Clear Chat
					</button>
				</div>
			{/if}
			<button type="submit" disabled={!userInput.trim() || $isProcessing}>Send</button>
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
		flex-grow: 1;
	}
	button {
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 20px;
		cursor: pointer;
		font-size: 14px;
		transition: background-color 0.2s;
		white-space: nowrap;
		margin-top: 0;
	}
	button:hover:not(:disabled) {
		background-color: #2980b9;
	}
	button:disabled {
		background-color: #bdc3c7;
		cursor: not-allowed;
		opacity: 0.7;
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
	button[type='submit'] {
		margin-left: auto;
		min-width: 80px;
	}
	@media (max-width: 600px) {
		.button-container {
			flex-direction: column;
			align-items: stretch;
		}
		.action-buttons {
			order: 2;
			justify-content: center;
		}
		.action-buttons button {
			flex-grow: 1;
		}
		button[type='submit'] {
			order: 1;
			margin-left: 0;
		}
	}
</style>
