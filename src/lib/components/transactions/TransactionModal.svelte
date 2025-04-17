<script lang="ts">
	import { derived } from 'svelte/store'; // Import derived
	import { appStore } from '$lib/stores/AppStore'; // Import the central store

	// Import services
	import { suggestCategory } from '$lib/services/ai/category';
	import { isLLMAvailable } from '$lib/services/ai/llm-helpers';

	// Import types
	import type { Category, Transaction } from '$lib/stores/types';

	// --- Create local derived store for the selected transaction object ---
	const selectedTransactionObject = derived(appStore, ($appStore) => {
		return $appStore.ui.selectedTransactionId
			? appStore.getTransactionById($appStore.ui.selectedTransactionId)
			: null;
	});

	// Local component state
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
	checkLLMAvailability();

	// Update local 'notes' variable when the derived selected transaction object changes
	$: if ($selectedTransactionObject) {
		notes = $selectedTransactionObject.notes || '';
	} else {
		notes = '';
	}

	// Request a category suggestion from the LLM
	async function requestCategorySuggestion() {
		// Use the derived object and direct store access
		const currentTxn = $selectedTransactionObject;
		const currentCategories = $appStore.categories; // Read directly via $
		if (!currentTxn || !currentCategories || currentCategories.length === 0 || !llmAvailable)
			return;

		suggestingCategory = true;
		try {
			// Pass the actual transaction object and categories array
			const suggested = await suggestCategory(currentTxn, currentCategories);
			// Call action to update modal's category state
			appStore.setModalCategory(suggested);
		} catch (error) {
			console.error('Error getting category suggestion:', error);
		} finally {
			suggestingCategory = false;
		}
	}

	// Handler for when the select element changes
	function handleCategoryChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		// Call action to update modal's category state
		appStore.setModalCategory(target.value as Category);
	}

	// Handler for saving category
	function handleUpdateCategory() {
		const currentTxnId = $appStore.ui.selectedTransactionId;
		const modalCategory = $appStore.ui.currentCategory; // Read current category from store
		if (currentTxnId) {
			// Call action with ID and category from store state
			appStore.assignCategory(currentTxnId, modalCategory);
		}
	}

	// Handler for saving notes
	function handleSaveNotes() {
		const currentTxnId = $appStore.ui.selectedTransactionId;
		if (currentTxnId) {
			// Call action with ID and local notes variable
			appStore.addNotes(currentTxnId, notes);
		}
	}

	// Function to close the modal (for clarity, could call directly)
	function closeModal() {
		appStore.closeTransactionDetails();
	}
</script>

{#if $appStore.ui.showTransactionDetails && $selectedTransactionObject}
	<div
		class="modal-backdrop"
		role="button"
		tabindex="0"
		on:click|self={closeModal}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				// Use Escape key
				closeModal();
			}
		}}
	>
		<div class="modal-content">
			<h3>Transaction Details</h3>
			<div class="transaction-details">
				<p><strong>Date:</strong> {$selectedTransactionObject.date}</p>
				<p><strong>Description:</strong> {$selectedTransactionObject.description}</p>
				<p><strong>Type:</strong> {$selectedTransactionObject.type}</p>
				<p>
					<strong>Amount:</strong>
					<span
						class={$selectedTransactionObject.direction === 'out'
							? 'expense-amount'
							: 'income-amount'}
					>
						${Math.abs($selectedTransactionObject.amount).toFixed(2)}
					</span>
				</p>

				<div class="category-selector">
					<label>
						<strong>Category:</strong>
						<div class="category-controls">
							<select value={$appStore.ui.currentCategory} on:change={handleCategoryChange}>
								{#each $appStore.categories as category (category)}
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
						<textarea bind:value={notes} placeholder="Add notes about this transaction..." rows="3"
						></textarea>
					</label>
					<button on:click={handleSaveNotes}> Save Notes </button>
				</div>
			</div>

			<button class="close-button" on:click={closeModal}> Close </button>
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
