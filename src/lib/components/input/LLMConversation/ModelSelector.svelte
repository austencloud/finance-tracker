<!-- src/lib/components/input/LLMConversation/ModelSelector.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/AppStore';
	import { AI_BACKEND_TO_USE, OLLAMA_CONFIG } from '$lib/config/ai-config';
	import { discoverOllamaModels } from '$lib/services/ai/model-discovery';

	// If user has typed in a custom model name
	let customModelName = '';
	let showCustomField = false;
	let refreshing = false;

	onMount(async () => {
		// Try to discover models on component mount
		await refreshModels();
	});

	async function refreshModels() {
		refreshing = true;
		try {
			await discoverOllamaModels();
		} catch (e) {
			console.error('Error refreshing models:', e);
		} finally {
			refreshing = false;
		}
	}

	function handleModelChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const value = select.value;

		if (value === 'custom') {
			showCustomField = true;
			return;
		}

		showCustomField = false;
		appStore.setSelectedModel(value);
	}

	function handleCustomSubmit() {
		if (!customModelName.trim()) return;

		// Now we need to add a method to appStore to add a custom model
		// Let's call the addCustomModel method that we'll create in the store
		appStore.addCustomModel(customModelName, 'ollama');

		// Reset the form
		showCustomField = false;
		customModelName = '';
	}
</script>

<div class="model-selector">
	<label for="model-select">Model:</label>
	<select id="model-select" on:change={handleModelChange} value={$appStore.ui.selectedModel}>
		<optgroup label="Ollama (Local)">
			{#each $appStore.ui.availableModels.filter((m) => m.backend === 'ollama') as model}
				<option value={model.id}>{model.name}</option>
			{/each}
		</optgroup>
		<optgroup label="DeepSeek (Cloud)">
			{#each $appStore.ui.availableModels.filter((m) => m.backend === 'deepseek') as model}
				<option value={model.id}>{model.name}</option>
			{/each}
		</optgroup>
		<option value="custom">Add Custom Ollama Model...</option>
	</select>

	<button
		class="refresh-button"
		on:click={refreshModels}
		disabled={refreshing}
		title="Refresh available Ollama models"
	>
		{#if refreshing}
			⟳
		{:else}
			⟳
		{/if}
	</button>

	{#if showCustomField}
		<div class="custom-model-input">
			<input type="text" bind:value={customModelName} placeholder="Enter Ollama model name" />
			<button on:click={handleCustomSubmit}>Add</button>
		</div>
	{/if}
</div>

<style>
	.model-selector {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		margin-left: auto;
	}

	label {
		color: #555;
		font-size: 12px;
	}

	select {
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #ddd;
		background-color: white;
		font-size: 13px;
	}

	.refresh-button {
		font-size: 14px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: #f0f0f0;
		border: 1px solid #ddd;
		cursor: pointer;
		padding: 0;
		color: #555;
	}

	.refresh-button:hover {
		background: #e0e0e0;
	}

	.refresh-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		100% {
			transform: rotate(360deg);
		}
	}

	.custom-model-input {
		display: flex;
		gap: 4px;
		margin-top: 4px;
		position: absolute;
		top: 100%;
		right: 0;
		background: white;
		padding: 8px;
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		z-index: 10;
		border: 1px solid #ddd;
	}

	.custom-model-input input {
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #ddd;
		font-size: 13px;
	}

	.custom-model-input button {
		padding: 4px 8px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
	}

	.custom-model-input button:hover {
		background-color: #2980b9;
	}
</style>
