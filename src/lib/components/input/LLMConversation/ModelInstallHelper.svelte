<!-- src/lib/components/input/LLMConversation/ModelInstallHelper.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/AppStore';
	import { isLLMAvailable } from '$lib/services/ai/llm';

	// Current model to provide instructions for
	$: currentModel = $appStore.ui.selectedModel;

	// Track availability locally - default to true since it seems to be working
	let modelAvailable = true;

	// Installation platform options
	let platform: 'mac' | 'windows' | 'linux' = 'mac';

	// Determine the correct installation command based on platform
	$: installCommand =
		platform === 'windows' ? `ollama.exe pull ${currentModel}` : `ollama pull ${currentModel}`;

	// Check model availability whenever the selected model changes
	$: if (currentModel) {
		checkModelAvailability();
	}

	// Re-check availability when component mounts
	onMount(() => {
		checkModelAvailability();
	});

	// Function to check if the current model is available
	async function checkModelAvailability() {
		try {
			const available = await isLLMAvailable();
			modelAvailable = available;

			// Update the store too
			appStore.setLLMAvailability(available);
		} catch (e) {
			console.error('Error checking model availability:', e);
			modelAvailable = false;
		}
	}

	// Helper function to force-check again
	function recheckAvailability() {
		checkModelAvailability();
	}
</script>

{#if !modelAvailable}
	<div class="model-install-helper">
		<h4>Ollama Model Not Available</h4>

		<p>
			The model <strong>{currentModel}</strong> doesn't appear to be installed or Ollama isn't running.
		</p>

		<div class="platform-selector">
			<label>
				<input type="radio" bind:group={platform} value="mac" />
				Mac
			</label>
			<label>
				<input type="radio" bind:group={platform} value="windows" />
				Windows
			</label>
			<label>
				<input type="radio" bind:group={platform} value="linux" />
				Linux
			</label>
		</div>

		<h5>Installation Steps</h5>
		<ol>
			<li>
				Make sure <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a> is
				installed and running
			</li>
			<li>Open a Terminal or Command Prompt and run:</li>
			<pre><code>{installCommand}</code></pre>
			<li>Wait for the download to complete (this may take a while)</li>
			<li>Click the button below to check if the model is now available</li>
		</ol>

		<button class="recheck-button" on:click={recheckAvailability}> Check Availability </button>

		<div class="note">
			<p>
				<strong>Note:</strong> If you'd prefer to use a different model, you can select one from the
				dropdown in the header.
			</p>
		</div>
	</div>
{/if}

<style>
	.model-install-helper {
		background-color: #f8f9fa;
		border: 1px solid #e9ecef;
		border-left: 4px solid #3498db;
		padding: 16px;
		margin: 16px 0;
		border-radius: 4px;
	}

	h4 {
		margin-top: 0;
		color: #2c3e50;
	}

	h5 {
		color: #2c3e50;
		margin-bottom: 8px;
	}

	pre {
		background-color: #343a40;
		color: #f8f9fa;
		padding: 12px;
		border-radius: 4px;
		overflow-x: auto;
	}

	code {
		font-family: monospace;
	}

	.platform-selector {
		display: flex;
		gap: 16px;
		margin: 16px 0;
	}

	.platform-selector label {
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}

	.recheck-button {
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 8px 16px;
		cursor: pointer;
		font-weight: bold;
		margin-top: 16px;
	}

	.recheck-button:hover {
		background-color: #2980b9;
	}

	.note {
		font-size: 14px;
		margin-top: 16px;
		padding-top: 12px;
		border-top: 1px solid #e9ecef;
	}

	a {
		color: #3498db;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
