<script lang="ts">
	import { get } from 'svelte/store';
	import { onDestroy } from 'svelte';
	import { sendMessage, abortAndClear } from '$lib/services/ai/conversation/conversationService';
	import { appStore } from '$lib/stores/AppStore';
	import { llmChat, makeSystemMsg, makeUserMsg } from '$lib/services/ai/llm-helpers';
	import { getSystemPrompt } from '$lib/services/ai/prompts';

	let userInput = '';
	let submitTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let isSubmitting = false;

	let showStarterPanel = false;
	$: isProcessingValue = $appStore.conversation.isProcessing;

	function useStarterResponse(text: string) {
		userInput = text;
		showStarterPanel = false;
		setTimeout(() => debounceSubmit(), 0);
	}

	function debounceSubmit() {
		if (isSubmitting) return;
		isSubmitting = true;
		handleSubmit();
		submitTimeoutId = setTimeout(() => {
			isSubmitting = false;
		}, 300);
	}

	function handleSubmit() {
		const currentInput = userInput.trim();
		if (!currentInput || get(appStore).conversation.isProcessing) {
			isSubmitting = false;
			if (submitTimeoutId) clearTimeout(submitTimeoutId);
			return;
		}
		sendMessage(currentInput);
		userInput = '';
		showStarterPanel = false;
	}

	async function handleCancel() {
		abortAndClear();
		userInput = '';
		isSubmitting = false;
		showStarterPanel = false;
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	}

	onDestroy(() => {
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	});

	// Clever scenario creator
	let exampleScenario: '' | 'income' | 'expense' | 'transfer' | 'multi' = '';

	const scenarioDescriptions: Record<string, string> = {
		income: 'a salary or other income',
		expense: 'an everyday purchase or bill payment',
		transfer: 'a peer-to-peer or bank transfer',
		multi: 'multiple transactions in one input'
	};

	async function generateExample(level: 1 | 2 | 3) {
		const today = new Date().toISOString().split('T')[0];
		const system = getSystemPrompt(today);
		let scenarioPrompt = '';
		if (exampleScenario && scenarioDescriptions[exampleScenario]) {
			scenarioPrompt = `Make it about ${scenarioDescriptions[exampleScenario]}.`;
		}
		const prompt = `
	Generate a single user-style transaction input example at CLARITY LEVEL ${level}.
	Level 1: extremely simple and direct (e.g. "Paid $20 for lunch.", "Got $100.", "Spent €15.", "Received £200.", "Bought coffee for $4.", "Salary $1500.", "Rent $800.")
	Level 2: moderately clear (e.g. "Yesterday I got my paycheck, about $1,500.", "Spent around €40 at the store last night.", "Got some cash from a friend, maybe £50.", "Paid the rent, $800, earlier this month.")
	Level 3: obtuse or roundabout (e.g. "Well, the job kicked in some funds mid-month, ballpark fifteen-hundred.", "Money came in for something I did last week.", "Dropped some cash at the market, not sure how much.", "A little something from a side gig showed up.")
	Vary the type of transaction (income, expense, transfer, refund, split bill, etc.), the
	amounts, the payees/payers, the currencies, the locations, the payment methods (cash,
	card, PayPal, Venmo, crypto, etc.), and the dates. Use different phrasings, personal
	tones, and contexts (work, travel, gifts, bills, shopping, entertainment, etc.).
	Sometimes use slang, abbreviations, or regional expressions. Just output that one line,
	no explanation. Don't include anything like "Here's a Level 2 transaction input
	example:", just get straight to the response.
	${scenarioPrompt}
`;
		try {
			const aiResponse = await llmChat([makeSystemMsg(system), makeUserMsg(prompt)], {
				temperature: 0.8,
				forceSimple: true,
				rawUserText: ''
			});
			const example = aiResponse.split('\n')[0].trim().replace(/^"|"$/g, '');
			userInput = example;
			setTimeout(() => debounceSubmit(), 0);
		} catch (err) {
			console.error('Failed to generate example:', err);
		}
	}

	async function generateSplitExample() {
		const today = new Date().toISOString().split('T')[0];
		const system = getSystemPrompt(today);
		const prompt = `Generate a user-style transaction input that describes splitting a bill or expense with others. The message should clearly mention splitting, the total amount, and optionally the context (e.g. dinner, rent, groceries). Use natural, realistic phrasing. Output only one line, no explanation.`;
		try {
			const aiResponse = await llmChat([makeSystemMsg(system), makeUserMsg(prompt)], {
				temperature: 0.8,
				forceSimple: true,
				rawUserText: ''
			});
			const example = aiResponse.split('\n')[0].trim().replace(/^"|"$/g, '');
			userInput = example;
			setTimeout(() => debounceSubmit(), 0);
		} catch (err) {
			console.error('Failed to generate split example:', err);
		}
	}
</script>

<div class="input-container">
	<form on:submit|preventDefault>
		<div class="starter-panel">
			<button
				type="button"
				class="starter-button"
				on:click={() => generateExample(1)}
				disabled={isProcessingValue || isSubmitting}
			>
				Level 1 Example
			</button>
			<button
				type="button"
				class="starter-button"
				on:click={() => generateExample(2)}
				disabled={isProcessingValue || isSubmitting}
			>
				Level 2 Example
			</button>
			<button
				type="button"
				class="starter-button"
				on:click={() => generateExample(3)}
				disabled={isProcessingValue || isSubmitting}
			>
				Level 3 Example
			</button>
			<button
				type="button"
				class="starter-button"
				on:click={generateSplitExample}
				disabled={isProcessingValue || isSubmitting}
			>
				Split Bill Example
			</button>
		</div>
		<textarea
			bind:value={userInput}
			placeholder="Describe transactions or ask questions..."
			rows="3"
			aria-label="Chat input"
			on:keydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					debounceSubmit();
				}
			}}
			disabled={isProcessingValue || isSubmitting}
		></textarea>

		<div class="button-container">
			<button
				type="button"
				class="cancel-button"
				title="Clear conversation history"
				on:click={handleCancel}
				disabled={isProcessingValue || isSubmitting}
			>
				Clear Chat
			</button>

			<button
				type="button"
				class="send-button"
				on:click={debounceSubmit}
				disabled={!userInput.trim() || isProcessingValue || isSubmitting}
			>
				Send {#if isProcessingValue || isSubmitting}<span class="loading-dots">...</span>{/if}
			</button>
		</div>
	</form>
</div>

<style>
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
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
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
		justify-content: space-between; /* Space between Clear and Send */
		align-items: center;
		flex-wrap: wrap; /* Allow wrapping if needed */
		gap: 8px;
	}
	/* Starter panel styles */
	.starter-panel {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
		padding: 8px;
		background: #f0f4f8;
		border-radius: 10px;
		border: 1px solid #d0d7de;
	}
	.starter-button {
		background-color: #34be82;
		color: white;
		padding: 8px 12px;
		border-radius: 15px;
		flex-grow: 1;
		min-width: 120px;
		text-align: center;
	}
	.starter-button:hover:not(:disabled) {
		background-color: #2c9e6d;
	}

	/* Existing button styles */
	button {
		padding: 8px 15px;
		color: white;
		border: none;
		border-radius: 20px;
		cursor: pointer;
		font-size: 14px;
		transition:
			background-color 0.2s,
			opacity 0.2s;
		white-space: nowrap;
		line-height: 1.4;
		position: relative;
		overflow: hidden;
	}
	button:hover:not(:disabled) {
		filter: brightness(90%); /* Slightly darken on hover */
	}
	button:disabled {
		background-color: #bdc3c7 !important; /* Use important to override specifics */
		cursor: not-allowed;
		opacity: 0.7;
	}
	.loading-dots {
		display: inline-block;
		margin-left: 4px;
	}
	.cancel-button {
		background-color: #e74c3c;
	}
	.cancel-button:hover:not(:disabled) {
		background-color: #c0392b;
	}

	.send-button {
		background-color: #3498db;
		margin-left: auto;
		min-width: 80px;
	}
	.send-button:hover:not(:disabled) {
		background-color: #2980b9;
	}

	@media (max-width: 600px) {
		.button-container {
			gap: 10px;
		}
		.cancel-button {
			flex-grow: 1;
		}
		.send-button {
			margin-left: 0;
		}
		.starter-panel {
			flex-direction: column;
		}
		.starter-button {
			width: 100%;
		}
	}
</style>
