<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// Import Stores
	import {
		conversationMessages,
		conversationProgress,
		conversationStatus,
		extractedTransactions,
		isProcessing // Use isProcessing store
	} from '../utils/conversation-store';
	// Import Services
	import { sendUserMessage, generateSummary } from '../utils/conversation-service';
	// Import Lifecycle
	import {
		initializeConversation,
		completeConversation,
		abortConversation
	} from '../utils/conversation-lifecycle';
	// Import main app store function
	import { addTransactions } from '../store';

	let userInput = '';
	let messagesContainer: HTMLElement;
	let autoScroll = true;
	let unsubscribers: (() => void)[] = [];
	let extractedCount = 0;
	// let isInitialized = false; // No longer needed, initializeConversation handles reset

	onMount(() => {
		// Initialize conversation (safe to call multiple times due to reset logic)
		initializeConversation();

		const unsubMessages = conversationMessages.subscribe((messages) => {
			if (autoScroll && messagesContainer) {
				/* ... scroll logic ... */
			}
		});
		const unsubExtracted = extractedTransactions.subscribe((txns) => {
			extractedCount = txns.length;
		});

		unsubscribers.push(unsubMessages, unsubExtracted);
		if (messagesContainer) {
			messagesContainer.addEventListener('scroll', handleScroll);
		}
		return () => {
			if (messagesContainer) {
				messagesContainer.removeEventListener('scroll', handleScroll);
			}
		};
	});

	onDestroy(() => {
		unsubscribers.forEach((unsub) => unsub());
		// Optionally abort if component is destroyed unexpectedly?
		// abortConversation();
	});

	function handleScroll() {
		/* ... scroll logic ... */
	}

	// Use imported sendUserMessage
	function handleSubmit() {
		if (!userInput.trim()) return;
		sendUserMessage(userInput); // Call imported function
		userInput = '';
	}

	// Use imported completeConversation
	function handleComplete() {
		const transactions = completeConversation(); // Call imported function
		if (transactions.length > 0) {
			addTransactions(transactions);
		}
	}

	// Use imported generateSummary
	function requestSummary() {
		generateSummary(); // Call imported function
	}

	// Use imported abortConversation if needed (e.g., for a cancel button)
	function handleCancel() {
		abortConversation();
	}

	function formatMessage(content: string) {
		/* ... format logic ... */
	}
</script>

<div class="conversation-container-embedded">
	{#if $conversationProgress > 0 && $conversationProgress < 100}
		<div class="progress-container">
			<div class="progress-bar" style="width: {$conversationProgress}%"></div>
		</div>
	{/if}
	<div class="messages-container" bind:this={messagesContainer}>
		{#each $conversationMessages as message, index (index)}
			<div class="message {message.role === 'user' ? 'user-message' : 'assistant-message'}">
				<div class="message-header">{message.role === 'user' ? 'You' : 'Assistant'}</div>
				<div class="message-content">
					{@html formatMessage(message.content)}
				</div>
			</div>
		{/each}
		{#if $isProcessing && $conversationStatus === 'Thinking...'}
			<div class="message assistant-message thinking">
				<div class="message-header">Assistant</div>
				<div class="message-content">
					<div class="typing-indicator">
						<span></span>
						<span></span>
						<span></span>
					</div>
				</div>
			</div>
		{/if}
	</div>
	<div class="input-container">
		<form on:submit|preventDefault={handleSubmit}>
			<textarea
				bind:value={userInput}
				placeholder="Paste transaction data or describe your transactions here..."
				rows="3"
				on:keydown={(e) => {
					/* ... keydown logic ... */
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
					</div>
				{/if}
				<button type="submit" disabled={!userInput.trim() || $isProcessing}>Send</button>
			</div>
		</form>
	</div>
</div>

<style>
	/* Remove modal styles */
	/* .conversation-modal { ... } */

	/* --- NEW Styles for Embedded Chat --- */
	.conversation-container-embedded {
		/* background-color: white; */ /* Handled by parent */
		/* width: 100%; */ /* Takes width from parent */
		/* max-width: none; */
		height: 60vh; /* Adjust height as needed */
		min-height: 400px;
		/* border-radius: 10px; */ /* Use parent border */
		overflow: hidden;
		display: flex;
		flex-direction: column;
		/* box-shadow: 0 5px 25px rgba(0, 0, 0, 0.2); */ /* Remove modal shadow */
	}

	.conversation-header-embedded {
		padding: 10px 15px;
		background-color: #eaf2f8; /* Lighter header */
		color: #2c3e50;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #ddd;
	}

	.conversation-header-embedded h4 {
		margin: 0;
		font-size: 16px;
	}
	/* --- End NEW --- */

	.progress-container {
		height: 4px;
		background-color: #e0e0e0;
		width: 100%;
	}

	.progress-bar {
		height: 100%;
		background-color: #2ecc71;
		transition: width 0.3s ease;
	}

	.status-message {
		font-size: 14px;
		color: #666;
		text-align: center;
		padding: 5px 0;
		background-color: #f8f9fa;
		border-bottom: 1px solid #eee;
	}

	.messages-container {
		flex-grow: 1;
		overflow-y: auto;
		padding: 15px;
		display: flex;
		flex-direction: column;
		gap: 15px;
		background-color: white; /* Ensure messages area is white */
	}

	.message {
		display: flex;
		flex-direction: column;
		max-width: 85%;
		padding: 10px 14px;
		border-radius: 18px;
		position: relative;
		font-size: 14px;
		line-height: 1.4;
	}

	.user-message {
		align-self: flex-end;
		background-color: #d1eaff; /* Lighter blue for user */
		color: #1c3d5a;
		border-bottom-right-radius: 4px;
	}

	.assistant-message {
		align-self: flex-start;
		background-color: #f1f3f5; /* Lighter grey for assistant */
		color: #343a40;
		border-bottom-left-radius: 4px;
	}

	.message-header {
		font-size: 11px;
		font-weight: bold;
		margin-bottom: 3px;
		color: #6c757d; /* Subdued header color */
		text-transform: uppercase;
	}

	.message-content {
		word-break: break-word;
	}

	/* Code block styling */
	:global(.code-block) {
		display: block;
		background-color: #e9ecef;
		color: #495057;
		padding: 10px;
		border-radius: 4px;
		margin-top: 5px;
		font-family: monospace;
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 13px;
	}

	.thinking .message-content {
		display: flex;
		align-items: center;
		height: 24px;
	}

	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.typing-indicator span {
		height: 8px;
		width: 8px;
		background-color: #adb5bd; /* Match subdued colors */
		border-radius: 50%;
		display: inline-block;
		animation: typing 1.4s infinite ease-in-out both;
	}

	.typing-indicator span:nth-child(1) {
		animation-delay: 0s;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.5;
		}
		50% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}

	.input-container {
		padding: 10px 15px;
		border-top: 1px solid #ddd;
		background-color: #f8f9fa; /* Match form background */
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
		border-radius: 20px; /* Rounded corners */
		font-family: inherit;
		font-size: 14px;
		line-height: 1.4;
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
		flex-wrap: wrap; /* Allow wrapping on small screens */
		gap: 8px;
	}

	.action-buttons {
		display: flex;
		gap: 8px;
		flex-wrap: wrap; /* Allow wrapping */
	}

	/* General button style from InputForm is good, maybe tweak specifics */
	button {
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 20px; /* Match textarea */
		cursor: pointer;
		font-size: 14px;
		transition: background-color 0.2s;
		white-space: nowrap;
		margin-top: 0; /* Override InputForm margin */
	}

	button:hover:not(:disabled) {
		background-color: #2980b9;
	}

	button:disabled {
		background-color: #bdc3c7;
		cursor: not-allowed;
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

	/* Send button aligned to the right */
	button[type='submit'] {
		margin-left: auto; /* Pushes send button to the right if space allows */
	}

	@media (max-width: 500px) {
		.button-container {
			flex-direction: column;
			align-items: stretch; /* Make buttons full width */
		}
		.action-buttons {
			order: 2; /* Move action buttons below send */
			justify-content: center;
		}
		button[type='submit'] {
			order: 1; /* Send button first */
			margin-left: 0;
		}
	}
</style>
