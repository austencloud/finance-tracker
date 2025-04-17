<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// --- Import specific store ---
	// import { appStore } from '$lib/stores/AppStore'; // REMOVE old import
	import { conversationStore } from '$lib/stores/conversationStore'; // ADD specific store import

	// --- Import Types ---
	import type { ConversationMessage } from '$lib/types/types'; // Adjust path if needed

	// --- Local Component State & Refs ---
	let messagesContainer: HTMLElement; // Reference to the scrollable container
	let autoScroll = true; // Flag to control automatic scrolling
	let unsub: () => void; // Function to unsubscribe from the store

	// --- Reactive State derived from conversationStore ---
	// Use the $ prefix for reactive access to store values
	$: messages = $conversationStore.messages;
	$: status = $conversationStore.status;
	$: processing = $conversationStore.isProcessing;

	// --- Utility Functions ---

	// Formats message content with basic Markdown (bold, italic, code blocks, lists)
	function formatMessage(content: string): string {
		try {
			let formatted = content || '';
			// Basic HTML escaping (important first step)
			formatted = formatted
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');

			// Code blocks ```...```
			formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
				const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				return `<pre class="code-block"><code>${escapedCode}</code></pre>`;
			});

			// Bold **...**
			formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
			// Italic _..._ or *...* (more robust matching)
			formatted = formatted.replace(
				/(?<![a-zA-Z0-9*])\*(?![* ])(.*?)(?<![ *])\*(?![a-zA-Z0-9*])/g,
				'<em>$1</em>'
			);
			formatted = formatted.replace(
				/(?<![a-zA-Z0-9_])_(?![_ ])(.*?)(?<![ _])_(?![a-zA-Z0-9_])/g,
				'<em>$1</em>'
			);

			// Basic Lists (simple implementation)
			// Unordered lists
			formatted = formatted.replace(/^\s*[-*+]\s+(.*)/gm, '<li>$1</li>'); // Handle -, *, +
			formatted = formatted.replace(/(?<!<ul>\s*)(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
			formatted = formatted.replace(/<\/ul>\s*<ul>/g, ''); // Merge adjacent

			// Ordered lists
			formatted = formatted.replace(/^\s*\d+\.\s+(.*)/gm, '<li>$1</li>');
			formatted = formatted.replace(/(?<!<ol>\s*)(<li>.*?<\/li>)/gs, '<ol>$1</ol>');
			formatted = formatted.replace(/<\/ol>\s*<ol>/g, ''); // Merge adjacent

			// Convert remaining newlines to <br>, avoiding those inside lists/code
			const parts = formatted.split(/(<(?:pre|ul|ol)[\s\S]*?<\/(?:pre|ul|ol)>)/);
			formatted = parts
				.map((part, index) => {
					if (index % 2 === 1) {
						// It's a pre, ul, or ol block
						return part;
					} else {
						// It's regular text
						return part.replace(/\n/g, '<br>');
					}
				})
				.join('');

			return formatted;
		} catch (e) {
			console.error('[LLMMessageList] Error in formatMessage:', e);
			return 'Error formatting message.'; // Fallback
		}
	}

	// Updates the autoScroll flag based on user scroll position
	function handleScroll() {
		if (messagesContainer) {
			const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
			// User is considered at the bottom if scroll position is within 50px of the end
			const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 50;
			autoScroll = isScrolledToBottom;
		}
	}

	// --- Lifecycle Hooks ---
	onMount(() => {
		// --- Subscribe only to conversationStore ---
		// We need the subscription primarily to trigger scrolling when new messages arrive
		unsub = conversationStore.subscribe((currentState) => {
			// Check if auto-scroll is enabled and the container element exists
			if (autoScroll && messagesContainer) {
				// Use requestAnimationFrame to ensure scrolling happens after the DOM updates
				requestAnimationFrame(() => {
					// Double-check container exists inside RAF callback
					if (messagesContainer) {
						messagesContainer.scrollTop = messagesContainer.scrollHeight;
					}
				});
			}
			// Note: Rendering of messages, status, processing indicator is handled
			// reactively by Svelte using $: variables above.
		});

		// Add scroll listener to the container to detect user scrolling
		messagesContainer?.addEventListener('scroll', handleScroll);

		// Initial scroll to bottom when the component first mounts
		if (messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			});
		}
	});

	onDestroy(() => {
		// --- Unsubscribe from conversationStore ---
		if (unsub) {
			unsub();
		}
		// Clean up scroll listener
		messagesContainer?.removeEventListener('scroll', handleScroll);
	});
</script>

<div class="messages-container" bind:this={messagesContainer} on:scroll={handleScroll}>
	{#each messages as message (message.id)}
		<div class="message {message.role === 'user' ? 'user-message' : 'assistant-message'}">
			<div class="message-header">
				{message.role === 'user' ? 'You' : 'Assistant'}
			</div>
			<div class="message-content">
				{#if message.content}
					{@html formatMessage(message.content)}
				{:else}
					<span style="color: grey; font-style: italic;">[Empty Message]</span>
				{/if}
			</div>
		</div>
	{:else}
		<p class="no-messages-placeholder">No messages yet...</p>
	{/each}

	{#if processing}
		<div class="message assistant-message thinking">
			<div class="message-header">Assistant</div>
			<div class="message-content">
				<div class="typing-indicator">
					<span></span><span></span><span></span>
				</div>
				{#if status && status !== 'Thinking…'}
					<span class="thinking-status">{status}</span>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Styles remain the same */
	.messages-container {
		flex-grow: 1;
		overflow-y: auto;
		padding: 15px;
		display: flex;
		flex-direction: column;
		gap: 15px;
		background-color: white;
		scrollbar-width: thin;
		scrollbar-color: #adb5bd #f1f3f5;
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
		word-wrap: break-word;
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
		margin-bottom: 4px;
		color: #6c757d;
		text-transform: uppercase;
		opacity: 0.8;
	}
	.message-content {
		word-break: break-word;
	}
	.message-content :global(ul),
	.message-content :global(ol) {
		padding-left: 25px;
		margin-top: 8px;
		margin-bottom: 8px;
	}
	.message-content :global(li) {
		margin-bottom: 4px;
	}
	.message-content :global(pre.code-block) {
		background-color: #e9ecef;
		border: 1px solid #ced4da;
		border-radius: 4px;
		padding: 12px;
		overflow-x: auto;
		white-space: pre;
		margin: 10px 0;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
		font-size: 13px;
		line-height: 1.5;
		color: #212529;
	}
	.message-content :global(pre.code-block code) {
		font-family: inherit;
		font-size: inherit;
		background: none;
		padding: 0;
		/* Reset potential global code styles */
		color: inherit;
		white-space: inherit;
	}
	.message-content :global(strong) {
		font-weight: 600;
	}
	.message-content :global(em) {
		font-style: italic;
	}
	.message-content :global(br) {
		content: '';
		display: block;
		margin-bottom: 0.5em;
	}
	.no-messages-placeholder {
		text-align: center;
		color: #aaa;
		margin-top: 20px;
		font-style: italic;
	}
	.thinking .message-content {
		display: flex;
		align-items: center;
		padding-top: 8px;
		padding-bottom: 8px;
		min-height: 24px;
	}
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.typing-indicator span {
		height: 9px;
		width: 9px;
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
			transform: translateY(-5px);
			opacity: 1;
		}
	}
	.thinking-status {
		margin-left: 8px;
		font-style: italic;
		color: #6c757d;
		font-size: 13px;
	}
</style>
