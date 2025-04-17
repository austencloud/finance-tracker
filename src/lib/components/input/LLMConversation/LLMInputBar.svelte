<script lang="ts">
	import { onDestroy } from 'svelte';
	// --- Store Imports ---
	// import { get } from 'svelte/store'; // No longer needed for direct state access here
	// import { appStore } from '$lib/stores/AppStore'; // REMOVE monolithic store import
	import { conversationStore } from '$lib/stores/conversationStore'; // IMPORT specific store

	// --- Service Imports ---
	import { sendMessage, abortAndClear } from '$lib/services/ai/conversation/conversationService'; // Keep service imports

	// --- LLM/Prompt Imports (Keep if generateExample is kept here) ---
	import { llmChat, makeSystemMsg, makeUserMsg } from '$lib/services/ai/llm-helpers';
	import { getSystemPrompt } from '$lib/services/ai/prompts';

	// --- Component State ---
	let userInput = '';
	let submitTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let isSubmitting = false; // Local state to prevent double clicks via debounce

	// Animation state for starter buttons
	let pressed = [false, false, false, false];
	let ripples = [false, false, false, false];

	function animateButton(idx: number) {
		pressed[idx] = true;
		ripples[idx] = false;
		setTimeout(() => {
			ripples[idx] = true;
			setTimeout(() => {
				pressed[idx] = false;
				ripples[idx] = false;
			}, 350);
		}, 10);
	}

	// Reactive variable bound to the specific store's state
	$: isProcessingValue = $conversationStore.isProcessing; // Use conversationStore

	// --- Example Generation (Keep for now, could be moved to store/service later) ---
	let exampleScenario: '' | 'income' | 'expense' | 'transfer' | 'multi' = '';
	const scenarioDescriptions: Record<string, string> = {
		income: 'a salary or other income',
		expense: 'an everyday purchase or bill payment',
		transfer: 'a peer-to-peer or bank transfer',
		multi: 'multiple transactions in one input'
	};

	async function generateExample(level: 1 | 2 | 3) {
		// This function still calls llmChat directly. Consider refactoring
		// if you want example generation to use the main conversation flow/state more deeply.
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
			// TODO: Consider adding loading state specific to example generation
			const aiResponse = await llmChat([makeSystemMsg(system), makeUserMsg(prompt)], {
				temperature: 0.8,
				forceSimple: true, // Use faster model for examples
				rawUserText: ''
			});
			const example = aiResponse.split('\n')[0].trim().replace(/^"|"$/g, '');
			userInput = example;
			// Automatically submit after generating example
			setTimeout(() => debounceSubmit(), 50); // Small delay
		} catch (err) {
			console.error('Failed to generate example:', err);
			// TODO: Show error to user?
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
			setTimeout(() => debounceSubmit(), 50);
		} catch (err) {
			console.error('Failed to generate split example:', err);
		}
	}

	// --- Input Handling ---
	function debounceSubmit() {
		if (isSubmitting || isProcessingValue) return; // Also check reactive processing value
		isSubmitting = true;
		handleSubmit();
		// Reset local submitting flag after a short delay
		submitTimeoutId = setTimeout(() => {
			isSubmitting = false;
		}, 300); // Adjust delay if needed
	}

	function handleSubmit() {
		const currentInput = userInput.trim();
		// Check reactive processing value from the store
		if (!currentInput || isProcessingValue) {
			isSubmitting = false; // Reset local flag if submit is blocked
			if (submitTimeoutId) clearTimeout(submitTimeoutId);
			return;
		}
		// Call the imported service function
		sendMessage(currentInput);
		userInput = ''; // Clear input after sending
	}

	async function handleCancel() {
		// Call the imported service function
		abortAndClear();
		userInput = '';
		isSubmitting = false; // Reset local submitting flag
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	}

	// Cleanup timeout on component destroy
	onDestroy(() => {
		if (submitTimeoutId) clearTimeout(submitTimeoutId);
	});
</script>

<div class="input-container">
	<form on:submit|preventDefault>
		<div class="starter-panel">
			<button
				type="button"
				class="starter-button {pressed[0] ? 'pressed' : ''}"
				on:click={() => {
					animateButton(0);
					generateExample(1);
				}}
				disabled={isProcessingValue || isSubmitting}
				title="Generate a simple example input"
			>
				<span class="ripple" class:ripple-active={ripples[0]}></span>
				Level 1 Example
			</button>
			<button
				type="button"
				class="starter-button {pressed[1] ? 'pressed' : ''}"
				on:click={() => {
					animateButton(1);
					generateExample(2);
				}}
				disabled={isProcessingValue || isSubmitting}
				title="Generate a moderately detailed example input"
			>
				<span class="ripple" class:ripple-active={ripples[1]}></span>
				Level 2 Example
			</button>
			<button
				type="button"
				class="starter-button {pressed[2] ? 'pressed' : ''}"
				on:click={() => {
					animateButton(2);
					generateExample(3);
				}}
				disabled={isProcessingValue || isSubmitting}
				title="Generate a vague or complex example input"
			>
				<span class="ripple" class:ripple-active={ripples[2]}></span>
				Level 3 Example
			</button>
			<button
				type="button"
				class="starter-button {pressed[3] ? 'pressed' : ''}"
				on:click={() => {
					animateButton(3);
					generateSplitExample();
				}}
				disabled={isProcessingValue || isSubmitting}
				title="Generate an example mentioning a split bill"
			>
				<span class="ripple" class:ripple-active={ripples[3]}></span>
				Split Bill Example
			</button>
		</div>

		<textarea
			bind:value={userInput}
			placeholder="Describe transactions or ask questions..."
			rows="3"
			aria-label="Chat input"
			on:keydown={(e) => {
				// Submit on Enter (not Shift+Enter)
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
				Clear Chat
			</button>

			<button
				type="submit"
				class="send-button"
				on:click={debounceSubmit}
				disabled={!userInput.trim() || isProcessingValue || isSubmitting}
				aria-label="Send message"
			>
				Send {#if isProcessingValue || isSubmitting}<span class="loading-dots">...</span>{/if}
			</button>
		</div>
	</form>
</div>

<style>
	/* Styles remain largely the same */
	.input-container {
		padding: 10px 15px;
		border-top: 1px solid #ddd;
		background-color: #f8f9fa;
		flex-shrink: 0; /* Prevent shrinking */
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
		border-radius: 20px; /* Rounded corners */
		font-family: inherit;
		font-size: 14px;
		line-height: 1.4;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
		min-height: 60px; /* Ensure a minimum height */
	}
	textarea:disabled {
		background-color: #e9ecef;
		cursor: not-allowed;
	}
	textarea:focus {
		outline: none;
		border-color: #3498db; /* Highlight focus */
		box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
	}
	.button-container {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	.starter-panel {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
		padding: 8px;
		background: #f0f4f8; /* Light background for panel */
		border-radius: 10px;
		border: 1px solid #d0d7de;
	}
	.starter-button {
		background-color: #34be82; /* Green for starters */
		color: white;
		padding: 6px 10px; /* Slightly smaller padding */
		border-radius: 15px;
		flex-grow: 1;
		min-width: 100px; /* Adjust min-width */
		text-align: center;
		font-size: 13px; /* Slightly smaller font */
		position: relative;
		transition:
			transform 0.12s cubic-bezier(0.4, 2, 0.6, 1),
			background 0.18s;
		will-change: transform;
	}
	.starter-button.pressed {
		transform: scale(0.93);
		background: #43e6a6 !important;
	}
	.ripple {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 0;
		height: 0;
		background: rgba(255, 255, 255, 0.45);
		border-radius: 50%;
		pointer-events: none;
		transform: translate(-50%, -50%) scale(1);
		opacity: 0;
		transition: opacity 0.2s;
		z-index: 1;
	}
	.ripple-active {
		width: 180%;
		height: 180%;
		opacity: 1;
		animation: ripple-pop 0.35s cubic-bezier(0.4, 2, 0.6, 1);
	}
	@keyframes ripple-pop {
		0% {
			transform: translate(-50%, -50%) scale(0.2);
			opacity: 0.7;
		}
		60% {
			transform: translate(-50%, -50%) scale(1.1);
			opacity: 0.45;
		}
		100% {
			transform: translate(-50%, -50%) scale(1.3);
			opacity: 0;
		}
	}
	button {
		padding: 8px 15px;
		color: white;
		border: none;
		border-radius: 20px; /* Consistent rounded corners */
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
		filter: brightness(90%);
	}
	button:disabled {
		background-color: #bdc3c7 !important;
		cursor: not-allowed;
		opacity: 0.7;
	}
	.loading-dots {
		display: inline-block;
		margin-left: 4px;
		/* Simple dot animation */
		width: 1em;
		text-align: left;
		animation: ellipsis 1.25s infinite;
	}
	/* Add keyframes if needed, or use a simpler indicator */
	@keyframes ellipsis {
		0% {
			content: '.';
		}
		33% {
			content: '..';
		}
		66% {
			content: '...';
		}
	}

	.cancel-button {
		background-color: #e74c3c; /* Red */
	}
	.cancel-button:hover:not(:disabled) {
		background-color: #c0392b;
	}

	.send-button {
		background-color: #3498db; /* Blue */
		margin-left: auto; /* Push send button to the right */
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
