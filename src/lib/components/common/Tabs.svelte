<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	export let tabs: string[] = [];
	export let active: string;
	const dispatch = createEventDispatcher<{ change: string }>();
	function select(tab: string) {
		if (tab === active) return;
		dispatch('change', tab);
	}
</script>

<div class="tabs">
	{#each tabs as tab}
		<button class:active={tab === active} on:click={() => select(tab)}>
			{tab}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
	}
	button {
		padding: 8px 16px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f8f9fa;
		cursor: pointer;
	}
	button.active {
		background: #3498db;
		color: #fff;
		border-color: #3498db;
	}
</style>
