<script lang="ts">
	import { conversationStore } from '$lib/stores/conversationStore';
	import { transactionStore } from '$lib/stores/transactionStore';
	import type { ConversationMessage, Transaction } from '$lib/types/types';
	import { onDestroy } from 'svelte';

	let chat: ConversationMessage[] = [];
	let transactions: Transaction[] = [];

	const unsubChat = conversationStore.subscribe((c) => (chat = c.messages));
	const unsubTx = transactionStore.subscribe((t) => (transactions = t));

	onDestroy(() => {
		unsubChat();
		unsubTx();
	});

	function formatForAI() {
		let out = [];
		out.push('=== AI Transaction Assistant Chat ===');
		chat.forEach((msg) => {
			out.push(`${msg.role.toUpperCase()}: ${msg.content}`);
		});
		out.push('\n=== Transactions ===');
		transactions.forEach((tx, i) => {
			out.push(`Transaction #${i + 1}: ${JSON.stringify(tx, null, 2)}`);
		});
		return out.join('\n');
	}

	let copied = false;
	async function copyAll() {
		await navigator.clipboard.writeText(formatForAI());
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}
</script>

<button class="copy-btn" on:click={copyAll} aria-label="Copy chat and transactions">
	<span class="icon"
		>{#if copied}
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none"
				><path
					d="M5 10.5l4 4 6-7"
					stroke="#eaffd0"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
		{:else}
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none"
				><rect x="5" y="5" width="10" height="12" rx="2" stroke="#fff" stroke-width="2" /><rect
					x="8"
					y="3"
					width="7"
					height="12"
					rx="2"
					stroke="#fff"
					stroke-width="1.5"
				/></svg
			>
		{/if}</span
	>
	<span>{copied ? 'Copied!' : 'Copy Details'}</span>
	{#if copied}<span class="copied">✓</span>{/if}
</button>

<style>
	.copy-btn {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.7em 1.5em;
		background: linear-gradient(90deg, #4f8cff 0%, #38e6c5 100%);
		color: #fff;
		border: none;
		border-radius: 2em;
		font-size: 1.05em;
		font-weight: 600;
		box-shadow: 0 2px 12px 0 rgba(80, 120, 255, 0.1);
		cursor: pointer;
		transition:
			background 0.2s,
			box-shadow 0.2s,
			transform 0.1s;
		outline: none;
		position: relative;
	}
	.copy-btn:hover,
	.copy-btn:focus {
		background: linear-gradient(90deg, #38e6c5 0%, #4f8cff 100%);
		box-shadow: 0 4px 18px 0 rgba(56, 230, 197, 0.13);
		transform: translateY(-2px) scale(1.03);
	}
	.copy-btn .icon {
		display: flex;
		align-items: center;
		font-size: 1.2em;
	}
	.copy-btn .copied {
		margin-left: 0.5em;
		font-size: 0.95em;
		color: #eaffd0;
		font-weight: 500;
		letter-spacing: 0.01em;
	}
</style>
