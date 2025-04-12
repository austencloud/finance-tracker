<!-- src/lib/components/input/LLMConversation/LLMMessageList.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import {
		conversationMessages,
		isProcessing,
		conversationStatus
	} from '$lib/services/ai/conversation';

	let messagesContainer: HTMLElement;
	let autoScroll = true;
	let unsub: () => void;

	// Basic utility to HTML-escape and format code blocks, bold, italic, etc.
	function formatMessage(content: string): string {
		try {
			let formatted = content || '';
			formatted = formatted
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');

			// Code blocks
			formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
				const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				return `<pre class="code-block">${escapedCode}</pre>`;
			});

			// Bold **...**
			formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
			// Italic _..._
			formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');

			return formatted;
		} catch (e) {
			console.error('[LLMMessageList] Error in formatMessage:', e);
			return 'Error formatting message.';
		}
	}

	function handleScroll() {
		if (messagesContainer) {
			const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
			// If user scrolls up significantly, disable auto-scroll
			if (scrollHeight - scrollTop - clientHeight > 50) {
				autoScroll = false;
			} else {
				autoScroll = true;
			}
		}
	}

	onMount(() => {
		// Subscribe to conversationMessages so we scroll down upon new messages
		unsub = conversationMessages.subscribe(() => {
			if (autoScroll && messagesContainer) {
				requestAnimationFrame(() => {
					if (messagesContainer) {
						messagesContainer.scrollTop = messagesContainer.scrollHeight;
					}
				});
			}
		});
		messagesContainer?.addEventListener('scroll', handleScroll);
	});

	onDestroy(() => {
		if (unsub) unsub();
		messagesContainer?.removeEventListener('scroll', handleScroll);
	});
</script>

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

	<!-- Optional: typing indicator if the assistant is 'Thinking...' -->
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

<style>
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
	.no-messages-placeholder {
		text-align: center;
		color: #aaa;
		margin-top: 20px;
		font-style: italic;
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
</style>
