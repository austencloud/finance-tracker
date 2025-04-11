<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store'; // Import get from svelte/store
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

	onMount(() => {
		console.log('[LLMConversation] onMount: Initializing conversation...');
		initializeConversation();

		console.log(
			'[LLMConversation] onMount: Initial messages count:',
			get(conversationMessages).length
		);
		if (get(conversationMessages).length > 0) {
			console.log(
				'[LLMConversation] onMount: First message content:',
				get(conversationMessages)[0]?.content.substring(0, 50) + '...'
			);
		}

		const unsubMessages = conversationMessages.subscribe((messages) => {
			console.log('[LLMConversation] conversationMessages updated:', messages.length, 'messages');
			// --- Scroll Logic ---
			if (autoScroll && messagesContainer) {
				// Use requestAnimationFrame for smoother scrolling after DOM update
				requestAnimationFrame(() => {
					if (messagesContainer) {
						messagesContainer.scrollTop = messagesContainer.scrollHeight;
					}
				});
			}
			// --- End Scroll Logic ---
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
	});

	function handleScroll() {
		// --- Scroll Logic ---
		if (messagesContainer) {
			const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
			// If user scrolls up significantly, disable auto-scroll
			// Otherwise, re-enable if they scroll back near the bottom
			if (scrollHeight - scrollTop - clientHeight > 50) {
				// Threshold to disable
				autoScroll = false;
			} else {
				autoScroll = true;
			}
			// console.log("[LLMConversation] Scrolled, autoScroll:", autoScroll);
		}
		// --- End Scroll Logic ---
	}

	function handleSubmit() {
		console.log('[LLMConversation] handleSubmit called.');
		if (!userInput.trim() || get(isProcessing)) return;
		sendUserMessage(userInput);
		userInput = '';
		autoScroll = true; // Ensure auto-scroll on send
	}

	function handleComplete() {
		if (get(isProcessing)) return;
		const transactions = completeConversation();
		if (transactions.length > 0) {
			addTransactions(transactions);
		}
	}

	function requestSummary() {
		if (get(isProcessing)) return;
		generateSummary();
	}

	function handleCancel() {
		abortConversation();
	}

	// --- FORMAT MESSAGE LOGIC RESTORED ---
	function formatMessage(content: string): string {
		// console.log("[LLMConversation] Formatting message:", content?.substring(0, 50) + '...');
		try {
			let formatted = content || ''; // Handle null/undefined content
			// Basic HTML escaping (important for security)
			formatted = formatted
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');

			// Replace code blocks AFTER escaping other HTML
			formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
				// Re-escape code content just in case, though it was escaped above
				const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				return `<pre class="code-block">${escapedCode}</pre>`;
			});
			// Replace **bold**
			formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
			// Replace _italic_
			formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
			// Replace *italic* (if needed, be careful with conflicts)
			// formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

			// Rely on CSS white-space: pre-wrap for newlines, no <br> needed
			return formatted;
		} catch (e) {
			console.error('[LLMConversation] Error in formatMessage:', e);
			return 'Error formatting message.'; // Return error text if formatting fails
		}
	}
	// --- END FORMAT MESSAGE LOGIC ---
</script>

<div class="conversation-container-embedded">
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

	<div class="messages-container" bind:this={messagesContainer}>
		{#each $conversationMessages as message (message)}
			<div class="message {message.role === 'user' ? 'user-message' : 'assistant-message'}">
				<div class="message-header">
					{message.role === 'user' ? 'You' : 'Assistant'}
				</div>
				<div class="message-content" style="white-space: pre-wrap;">
					{#if message.content}
						{@html formatMessage(message.content)}
					{:else}
						<span style="color: red;">[Empty Message Content]</span>
					{/if}
				</div>
			</div>
		{:else}
			<p class="no-messages-placeholder">No messages yet...</p>
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
				placeholder="Describe transactions or ask questions..."
				rows="3"
				aria-label="Chat input"
				on:keydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault(); // Prevent newline
						handleSubmit(); // Send message
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
</div>

<style>
	/* Include all styles from the previous version */
	.no-messages-placeholder {
		text-align: center;
		color: #aaa;
		margin-top: 20px;
		font-style: italic;
	}
	.conversation-container-embedded {
		height: 60vh;
		min-height: 400px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		border: 1px solid #e0e0e0;
		border-radius: 5px;
		background-color: #f8f9fa;
	}
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
	.messages-container {
		flex-grow: 1;
		overflow-y: auto;
		padding: 15px;
		display: flex;
		flex-direction: column;
		gap: 15px;
		background-color: white;
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
		background-color: #d1eaff;
		color: #1c3d5a;
		border-bottom-right-radius: 4px;
	}
	.assistant-message {
		align-self: flex-start;
		background-color: #f1f3f5;
		color: #343a40;
		border-bottom-left-radius: 4px;
	}
	.message-header {
		font-size: 11px;
		font-weight: bold;
		margin-bottom: 3px;
		color: #6c757d;
		text-transform: uppercase;
	}
	.message-content {
		word-break: break-word;
	}
	:global(pre.code-block) {
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
		border: 1px solid #ced4da;
	}
	.thinking .message-content {
		display: flex;
		align-items: center;
		height: 24px;
		padding-top: 5px;
		padding-bottom: 5px;
	}
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.typing-indicator span {
		height: 8px;
		width: 8px;
		background-color: #adb5bd;
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
