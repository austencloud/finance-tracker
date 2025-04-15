<script lang="ts">
	import { suggestCategory } from '$lib/services/ai/category';
	import { isLLMAvailable } from '$lib/services/ai/deepseek-client';
	import {
		// State (read-only derived stores via adapters)
		showTransactionDetails,
		selectedTransaction,
		currentCategory, // Still needed for reading the current value
		categories, // Import categories via adapter

		// Actions (via adapters)
		assignCategory,
		addNotes,
		setCurrentCategory,
		closeTransactionDetails, // Action to update the category in the modal UI state
	} from '$lib/stores';

	// Import services (ensure they use appStore internally if needed)
	import type { Category } from '$lib/stores/types'; // Import type

	// Local component state remains the same
	let notes = '';
	let suggestingCategory = false;
	let llmAvailable = false;

	// Check if LLM is available
	const checkLLMAvailability = async () => {
		try {
			llmAvailable = await isLLMAvailable();
		} catch (error) {
			llmAvailable = false;
		}
	};
	checkLLMAvailability(); // Run on component initialization

	// Update local 'notes' variable when selected transaction changes
	$: if ($selectedTransaction) {
		notes = $selectedTransaction.notes || '';
	} else {
		notes = ''; // Clear notes if no transaction is selected
	}

	// Request a category suggestion from the LLM
	async function requestCategorySuggestion() {
		if (!$selectedTransaction || !llmAvailable) return;

		suggestingCategory = true;
		try {
			// suggestCategory service might need refactoring if it used old stores
			const suggested = await suggestCategory($selectedTransaction, $categories);
			// --- Use Action to update state ---
			setCurrentCategory(suggested);
		} catch (error) {
			console.error('Error getting category suggestion:', error);
			// Optionally notify the user
		} finally {
			suggestingCategory = false;
		}
	}

	// Handler for when the select element changes
	function handleCategoryChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		// --- Use Action to update state ---
		setCurrentCategory(target.value as Category);
	}

	// Handler for saving category (uses imported action)
	function handleUpdateCategory() {
		if ($selectedTransaction) {
			// assignCategory adapter expects (transaction, category)
			assignCategory($selectedTransaction, $currentCategory);
			// Optionally close modal after update, or show success
			// closeTransactionDetails();
		}
	}

	// Handler for saving notes (uses imported action)
	function handleSaveNotes() {
		if ($selectedTransaction) {
			// addNotes adapter expects (transaction, notes)
			addNotes($selectedTransaction, notes);
			// Optionally close modal after update, or show success
			// closeTransactionDetails();
		}
	}
</script>

{#if $showTransactionDetails && $selectedTransaction}
	<div
		class="modal-backdrop"
		role="button"
		tabindex="0"
		on:click|self={closeTransactionDetails}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				closeTransactionDetails();
			}
		}}
	>
		<div class="modal-content">
			<h3>Transaction Details</h3>
			<div class="transaction-details">
				<p><strong>Date:</strong> {$selectedTransaction.date}</p>
				<p><strong>Description:</strong> {$selectedTransaction.description}</p>
				<p><strong>Type:</strong> {$selectedTransaction.type}</p>
				<p>
					<strong>Amount:</strong>
					<span
						class={$selectedTransaction.direction === 'out' ? 'expense-amount' : 'income-amount'}
					>
						${Math.abs($selectedTransaction.amount).toFixed(2)}
					</span>
				</p>

				<div class="category-selector">
					<label>
						<strong>Category:</strong>
						<div class="category-controls">
							<select value={$currentCategory} on:change={handleCategoryChange}>
								{#each $categories as category (category)}
									<option value={category}>{category}</option>
								{/each}
							</select>

							{#if llmAvailable}
								<button
									class="suggest-button"
									on:click={requestCategorySuggestion}
									disabled={suggestingCategory}
								>
									{suggestingCategory ? 'Suggesting...' : 'Suggest Category'}
								</button>
							{/if}
						</div>
					</label>
					<button on:click={handleUpdateCategory}> Update Category </button>
				</div>

				<div class="notes-section">
					<label>
						<strong>Notes:</strong>
						<textarea bind:value={notes} placeholder="Add notes about this transaction..." rows="3"></textarea>
					</label>
					<button on:click={handleSaveNotes}> Save Notes </button>
				</div>
			</div>

			<button class="close-button" on:click={closeTransactionDetails}> Close </button>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-content {
		background-color: white;
		padding: 25px;
		border-radius: 5px;
		width: 90%;
		max-width: 500px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
	}

	h3 {
		margin-top: 0;
		color: #2c3e50;
	}

	.transaction-details {
		margin: 15px 0;
	}

	.expense-amount {
		color: #e74c3c;
	}

	.income-amount {
		color: #27ae60;
	}

	.category-selector,
	.notes-section {
		margin-top: 15px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.category-controls {
		display: flex;
		gap: 10px;
		margin-top: 5px;
	}

	select,
	textarea {
		width: 100%;
		padding: 8px;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	textarea {
		font-family: Arial, sans-serif;
		resize: vertical;
	}

	button {
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	button:hover {
		background-color: #2980b9;
	}

	.suggest-button {
		background-color: #9b59b6;
		padding: 6px 10px;
		font-size: 0.9em;
	}

	.suggest-button:hover {
		background-color: #8e44ad;
	}

	.suggest-button:disabled {
		background-color: #d1c4e9;
		cursor: not-allowed;
	}

	.close-button {
		margin-top: 20px;
		background-color: #e74c3c;
	}

	.close-button:hover {
		background-color: #c0392b;
	}
</style>
