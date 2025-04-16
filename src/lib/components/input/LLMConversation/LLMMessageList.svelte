<script lang="ts">
	// 1. Import the central store and necessary types
	import { appStore } from '$lib/stores/AppStore';
	import type { ConversationMessage } from '$lib/stores/types'; // Assuming type is here
	import { onMount, onDestroy } from 'svelte';
	// Removed unused 'get' import

	let messagesContainer: HTMLElement;
	let autoScroll = true;
	let unsub: () => void; // Unsubscriber function for appStore

	// 2. Access conversation state directly from appStore reactively
	// No need for explicit casting 'as ...' if appStore is properly typed
	$: messages = $appStore.conversation.messages;
	$: status = $appStore.conversation.status;
	$: processing = $appStore.conversation.isProcessing;

	// Basic utility to HTML-escape and format code blocks, bold, italic, etc.
	function formatMessage(content: string): string {
		try {
			let formatted = content || '';
			// Basic HTML escaping
			formatted = formatted
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');

			// Code blocks ```...``` - Capture content, escape it, then wrap
			// Ensure multiline and special chars inside code blocks are handled
			formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
				// Escape HTML within the code block *after* capturing it
				const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				return `<pre class="code-block"><code>${escapedCode}</code></pre>`; // Wrap in <code>
			});

			// Bold **...**
			formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
			// Italic _..._ or *...* (ensure not interfering with bold)
			// Match single underscores/asterisks not adjacent to others
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
			formatted = formatted.replace(/^\s*-\s+(.*)/gm, '<li>$1</li>'); // Convert lines starting with '-'
			// Wrap list items only if they aren't already wrapped (lookbehind assertion)
			formatted = formatted.replace(/(?<!<ul>\s*)(<li>.*?<\/li>)/gs, (match, liBlock) => {
				// Check if the block is already within a <ul> or <ol> context nearby if needed
				return `<ul>${liBlock}</ul>`; // Simple wrap for now
			});
			formatted = formatted.replace(/<\/ul>\s*<ul>/g, ''); // Merge adjacent lists

			// Ordered lists (simple implementation - doesn't handle nested or complex numbering)
			formatted = formatted.replace(/^\s*\d+\.\s+(.*)/gm, '<li>$1</li>'); // Convert lines starting with '1.', '2.' etc.
			// Wrap list items only if they aren't already wrapped (lookbehind assertion)
			formatted = formatted.replace(/(?<!<ol>\s*)(<li>.*?<\/li>)/gs, (match, liBlock) => {
				// Check if the block is already within a <ul> or <ol> context nearby if needed
				return `<ol>${liBlock}</ol>`; // Simple wrap for now
			});
			formatted = formatted.replace(/<\/ol>\s*<ol>/g, ''); // Merge adjacent lists

			// Convert newlines to <br> tags *outside* of pre blocks
			const parts = formatted.split(/(<pre[\s\S]*?<\/pre>)/);
			formatted = parts
				.map((part, index) => {
					if (index % 2 === 1) {
						// It's a <pre> block
						return part;
					} else {
						// It's regular text
						// Avoid converting newlines immediately after closing list tags or before opening ones
						// to prevent extra space around lists.
						return part.replace(/(?<!(<\/ul>|<\/ol>))\n(?!\s*(<ul>|<ol>|<li>))/g, '<br>');
					}
				})
				.join('');

			return formatted;
		} catch (e) {
			console.error('[LLMMessageList] Error in formatMessage:', e);
			// Return escaped original content on error? Or a fixed error message.
			return 'Error formatting message.';
		}
	}

	function handleScroll() {
		if (messagesContainer) {
			const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
			// Determine if the user is close to the bottom
			const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 50; // Threshold of 50px
			autoScroll = isScrolledToBottom;
		}
	}

	onMount(() => {
		// 3. Subscribe to the main appStore to react to changes (specifically for scrolling)
		// The actual message rendering is handled by the reactive '$: messages' above
		unsub = appStore.subscribe((currentState) => {
			// We only need to scroll if autoScroll is enabled (user is near the bottom)
			// and the container exists. The subscription triggers on *any* state change,
			// but scrolling only happens if conditions are met.
			if (autoScroll && messagesContainer) {
				// Use requestAnimationFrame to ensure scrolling happens after DOM updates
				requestAnimationFrame(() => {
					if (messagesContainer) {
						// Double-check existence inside RAF
						messagesContainer.scrollTop = messagesContainer.scrollHeight;
					}
				});
			}
			// Optional: could add logic here to only scroll if message count changed,
			// but current approach is simpler and usually fine.
		});

		// Add scroll listener to manage the autoScroll flag
		messagesContainer?.addEventListener('scroll', handleScroll);

		// Initial scroll to bottom when component mounts
		if (messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			});
		}
	});

	onDestroy(() => {
		// 4. Unsubscribe from appStore
		if (unsub) unsub();
		messagesContainer?.removeEventListener('scroll', handleScroll);
	});
</script>

<div class="messages-container" bind:this={messagesContainer}>
	{#each messages as message, i (message.timestamp || i)}
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
					<span></span>
					<span></span>
					<span></span>
				</div>
				{#if status && status !== 'Thinking...'}
					<span style="margin-left: 8px; font-style: italic; color: #6c757d;">{status}</span>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.messages-container {
		flex-grow: 1;
		overflow-y: auto;
		padding: 15px;
		display: flex;
		flex-direction: column;
		gap: 15px;
		background-color: white;
		/* Improve scrollbar appearance */
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
		word-wrap: break-word; /* Ensure long words break */
	}
	.user-message {
		align-self: flex-end;
		background-color: #d1eaff; /* Slightly softer blue */
		color: #1c3d5a;
		border-bottom-right-radius: 4px;
	}
	.assistant-message {
		align-self: flex-start;
		background-color: #f1f3f5; /* Standard light grey */
		color: #343a40;
		border-bottom-left-radius: 4px;
	}
	.message-header {
		font-size: 11px;
		font-weight: bold;
		margin-bottom: 4px; /* Slightly more space */
		color: #6c757d;
		text-transform: uppercase;
		opacity: 0.8; /* De-emphasize slightly */
	}
	.message-content {
		word-break: break-word; /* Already set on .message, but good fallback */
	}
	/* Ensure lists inside messages look okay */
	.message-content :global(ul),
	.message-content :global(ol) {
		padding-left: 25px; /* More standard indentation */
		margin-top: 8px;
		margin-bottom: 8px;
	}
	.message-content :global(li) {
		margin-bottom: 4px; /* Space between list items */
	}

	/* Style for code blocks */
	.message-content :global(pre.code-block) {
		background-color: #e9ecef;
		border: 1px solid #ced4da;
		border-radius: 4px;
		padding: 12px; /* More padding */
		overflow-x: auto;
		white-space: pre; /* Keep whitespace within code block */
		margin: 10px 0; /* More vertical space */
		font-family:
			'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; /* Better font stack */
		font-size: 13px;
		line-height: 1.5; /* Better readability for code */
		color: #212529; /* Darker text for contrast */
	}
	.message-content :global(pre.code-block code) {
		font-family: inherit; /* Inherit from pre */
		font-size: inherit;
		background: none; /* Ensure no conflicting background */
		padding: 0;
	}
	/* Styling for bold/italic */
	.message-content :global(strong) {
		font-weight: 600; /* Slightly bolder */
	}
	.message-content :global(em) {
		font-style: italic;
	}
	/* Add spacing after paragraphs/breaks */
	.message-content :global(br) {
		content: '';
		display: block;
		margin-bottom: 0.5em; /* Space after a line break */
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
		/* height: 24px; /* Let height be natural */
		padding-top: 8px; /* Adjust padding */
		padding-bottom: 8px;
		min-height: 24px; /* Ensure minimum height */
	}
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 5px; /* Slightly more gap */
	}
	.typing-indicator span {
		height: 9px; /* Slightly larger dots */
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
			transform: translateY(-5px); /* Slightly more bounce */
			opacity: 1;
		}
	}
</style>
