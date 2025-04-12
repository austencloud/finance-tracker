<!-- src/lib/components/input/InputForm.svelte -->
<script lang="ts">
	import LLMConversationLayout from './LLMConversation/LLMConversationLayout.svelte';
	import { loading, showSuccessMessage } from '$lib/stores/uiStore';
	import { addTransactions } from '$lib/stores/transactionStore';
	import { parseTransactionData, getSampleData } from '$lib/services/parser';
	import { isLLMAvailable } from '$lib/services/ai';
	import type { Transaction } from '$lib/types';

	// Input Mode State
	type InputMode = 'standard' | 'aiChat';
	let inputMode: InputMode = 'standard';

	let inputText = '';
	let llmAvailable = false;
	let processingError = '';

	// Check if LLM is available
	const checkLLMAvailability = async () => {
		try {
			llmAvailable = await isLLMAvailable();
			// If LLM isn't available, default to standard mode
			if (!llmAvailable) {
				inputMode = 'standard';
			}
		} catch (error) {
			llmAvailable = false;
			inputMode = 'standard';
		}
	};

	// Run the check when component mounts
	checkLLMAvailability();

	// Handle form submission for standard pasting mode
	async function handleStandardSubmit(): Promise<void> {
		if (inputText.trim()) {
			processingError = '';
			$loading = true;

			try {
				const parsedTransactions = parseTransactionData(inputText);
				addTransactions(parsedTransactions);

				// Clear the input after parsing
				inputText = '';
			} catch (error) {
				console.error('Error processing standard transactions:', error);
				if (error instanceof Error) {
					processingError = `Error processing transactions: ${error.message}`;
				} else {
					processingError = 'Unknown error processing transactions';
				}
			} finally {
				$loading = false;
			}
		}
	}

	// Load sample data
	function loadSampleData(): void {
		$loading = true;
		const sampleData = getSampleData();
		const parsedTransactions = parseTransactionData(sampleData);
		addTransactions(parsedTransactions);
		$loading = false;
	}

	// Import data from JSON
	function importData(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		$loading = true;
		processingError = ''; // Clear previous errors

		const reader = new FileReader();
		reader.onload = (e: ProgressEvent<FileReader>) => {
			try {
				const result = e.target?.result;
				if (typeof result === 'string') {
					const importedData = JSON.parse(result) as Transaction[];
					if (Array.isArray(importedData)) {
						addTransactions(importedData);
					} else {
						throw new Error('Invalid JSON format. Expected an array of transactions.');
					}
				} else {
					throw new Error('Could not read file content.');
				}
			} catch (error) {
				if (error instanceof Error) {
					processingError = 'Error importing data: ' + error.message;
				} else {
					processingError = 'Unknown error importing data';
				}
			} finally {
				$loading = false;
			}
		};
		reader.onerror = () => {
			processingError = 'Error reading the file.';
			$loading = false;
		};
		reader.readAsText(file);

		// Reset the file input
		input.value = '';
	}
</script>

<div class="form-container">
	<div class="header-controls">
		<h2>Input Transaction Data</h2>

		{#if llmAvailable}
			<div class="mode-switcher">
				<button class:active={inputMode === 'standard'} on:click={() => (inputMode = 'standard')}>
					Standard Input
				</button>
				<button class:active={inputMode === 'aiChat'} on:click={() => (inputMode = 'aiChat')}>
					Chat with AI Assistant
				</button>
			</div>
		{/if}
	</div>

	{#if processingError}
		<div class="error-message">
			{processingError}
		</div>
	{/if}

	{#if inputMode === 'standard'}
		<div class="input-options">
			<div class="option">
				<h3>Option 1: Paste Text</h3>
				<form on:submit|preventDefault={handleStandardSubmit}>
					<textarea
						bind:value={inputText}
						placeholder="Paste your transaction data here (standard formats work best)..."
						rows="10"
					></textarea>

					<button type="submit" disabled={$loading}>
						{$loading ? 'Processing...' : 'Process Pasted Text'}
					</button>
				</form>
			</div>

			<div class="option">
				<h3>Option 2: Import/Load</h3>
				<div class="import-export-buttons">
					<label class="file-input-label">
						Import JSON
						<input
							type="file"
							accept=".json"
							on:change={importData}
							disabled={$loading}
							style="display: none;"
						/>
					</label>

					<button on:click={loadSampleData} class="sample-data-button" disabled={$loading}>
						Load Sample Data
					</button>
				</div>
			</div>
		</div>
	{:else if inputMode === 'aiChat' && llmAvailable}
		<div class="ai-chat-container">
			<LLMConversationLayout />
		</div>
	{/if}

	{#if !llmAvailable}
		<div class="llm-status">
			<p>
				🔌 AI processing features are not available. <a
					href="https://ollama.com/"
					target="_blank"
					rel="noopener noreferrer">Install Ollama</a
				>
				and ensure it's running with a model like 'llama3' to enable AI chat and analysis.
			</p>
		</div>
	{/if}
</div>

<style>
	.form-container {
		margin-bottom: 30px;
		background-color: #f8f9fa;
		padding: 20px;
		border-radius: 5px;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
	}

	.header-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 15px;
		margin-bottom: 15px;
		padding-bottom: 10px;
		border-bottom: 1px solid #eee;
	}

	h2 {
		color: #3498db;
		margin: 0;
		padding: 0;
		border: none;
		flex-grow: 1;
	}

	h3 {
		margin-top: 15px;
		margin-bottom: 10px;
		color: #555;
	}

	.input-options {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}

	.option {
		flex: 1;
		min-width: 300px;
	}

	textarea {
		width: 100%;
		padding: 10px;
		font-family: monospace;
		border: 1px solid #ddd;
		border-radius: 4px;
		resize: vertical;
	}

	button {
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		margin-top: 10px;
		transition: background-color 0.2s;
	}

	button:hover:not(:disabled) {
		background-color: #2980b9;
	}

	button:disabled {
		background-color: #95a5a6;
		cursor: not-allowed;
	}

	.file-input-label {
		display: inline-block;
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border-radius: 4px;
		cursor: pointer;
		margin-top: 10px;
		transition: background-color 0.2s;
	}

	.file-input-label:hover {
		background-color: #2980b9;
	}

	.sample-data-button {
		background-color: #9b59b6;
	}

	.sample-data-button:hover:not(:disabled) {
		background-color: #8e44ad;
	}

	.import-export-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.error-message {
		background-color: #f8d7da;
		color: #721c24;
		padding: 10px 15px;
		border-radius: 4px;
		margin-bottom: 15px;
	}

	.mode-switcher {
		display: flex;
		border: 1px solid #ccc;
		border-radius: 5px;
		overflow: hidden;
	}

	.mode-switcher button {
		margin: 0;
		border: none;
		border-radius: 0;
		padding: 8px 12px;
		background-color: #f0f0f0;
		color: #555;
		cursor: pointer;
		transition:
			background-color 0.2s,
			color 0.2s;
	}

	.mode-switcher button:hover:not(.active) {
		background-color: #e0e0e0;
	}

	.mode-switcher button.active {
		background-color: #3498db;
		color: white;
	}

	.mode-switcher button:first-child {
		border-right: 1px solid #ccc;
	}

	.ai-chat-container {
		border: 1px solid #e0e0e0;
		border-radius: 5px;
		margin-top: 15px;
		background-color: white;
	}

	.llm-status {
		margin-top: 15px;
		padding: 10px 15px;
		background-color: #e8f4f8;
		border-radius: 4px;
		border-left: 4px solid #3498db;
		font-size: 14px;
	}

	.llm-status a {
		color: #3498db;
		text-decoration: none;
		font-weight: bold;
	}

	.llm-status a:hover {
		text-decoration: underline;
	}

	@media (max-width: 768px) {
		.header-controls {
			flex-direction: column;
			align-items: flex-start;
		}
		.input-options {
			flex-direction: column;
		}
	}
</style>
