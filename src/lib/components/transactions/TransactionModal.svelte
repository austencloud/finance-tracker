<script lang="ts">
	// --- Store Imports ---
	// import { derived } from 'svelte/store'; // REMOVE derived import
	// import { appStore } from '$lib/stores/AppStore'; // REMOVE monolithic store import
	import { uiStore } from '$lib/stores/uiStore'; // ADD ui store
	import { transactionStore } from '$lib/stores/transactionStore'; // ADD transaction store
	import { categories } from '$lib/stores/categoryStore'; // ADD category store

	// --- Selector Imports ---
	import { getTransactionById } from '$lib/stores/selectors'; // ADD selector import

	// --- Service Imports ---
	import { suggestCategory } from '$lib/services/ai/category'; // Adjust path if needed
	import { isOllamaAvailable } from '$lib/services/ai/ollama-client'; // Adjust path if needed

	// --- Type Imports ---
	import type { Category, Transaction } from '$lib/types/types'; // Adjust path if needed
	import { formatCurrency } from '$lib/utils/helpers'; // Import if needed for display (already used in template)

	// --- Component State ---
	let notes = ''; // Local state for the notes textarea
	let suggestingCategory = false; // Local state for category suggestion loading
	let llmAvailable = false; // Local state for LLM availability

	// --- Reactive Derivations ---
	// Get the selected ID from the uiStore
	$: selectedTransactionId = $uiStore.selectedTransactionId;
	// Get the full transaction object using the selector based on the ID
	$: selectedTransactionObject = getTransactionById(selectedTransactionId);

	// Update local 'notes' and modal category when the selected transaction changes
	$: if (selectedTransactionObject) {
		notes = selectedTransactionObject.notes || '';
		// Use the first category in the array for the modal's initial state, or fallback
		const firstCategory = selectedTransactionObject.categories?.[0] || $categories[0];
		uiStore.setModalCategory(firstCategory as Category);
	} else {
		notes = ''; // Clear notes if no transaction selected
	}

	// --- Lifecycle / Async ---
	// Check LLM availability on component initialization (or react to a global store value)
	const checkLLMAvailability = async () => {
		try {
			llmAvailable = await isOllamaAvailable();
		} catch (error) {
			console.warn('LLM availability check failed:', error);
			llmAvailable = false;
		}
	};
	checkLLMAvailability(); // Run check

	// --- Event Handlers ---

	// Request a category suggestion from the LLM
	async function requestCategorySuggestion() {
		const currentTxn = selectedTransactionObject; // Use the derived object
		const currentCategories = $categories; // Use the category store value

		// Ensure necessary data and LLM availability
		if (!currentTxn || !currentCategories || currentCategories.length === 0 || !llmAvailable) {
			console.warn('Cannot suggest category: Missing transaction, categories, or LLM.');
			return;
		}

		suggestingCategory = true; // Set loading state
		try {
			// Call the suggestCategory service
			const suggested = await suggestCategory(currentTxn, currentCategories);
			// --- Call action on uiStore to update the *modal's* selected category ---
			uiStore.setModalCategory(suggested);
		} catch (error) {
			console.error('Error getting category suggestion:', error);
			// TODO: Show error feedback to user?
		} finally {
			suggestingCategory = false; // Clear loading state
		}
	}

	// Handler for when the category select element changes
	function handleCategoryChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		// Update the modal's selected category in the UI store
		uiStore.setModalCategory(target.value as Category);
	}

	// Handler for saving the selected category to the transaction
	function handleUpdateCategory() {
		const currentTxnId = $uiStore.selectedTransactionId; // Get ID from uiStore
		const modalCategory = $uiStore.currentCategory; // Get category from uiStore

		if (currentTxnId && modalCategory) {
			// Use assignCategory instead of updateCategories
			transactionStore.assignCategory(currentTxnId, modalCategory);
		} else {
			console.warn('Cannot update category: Missing transaction ID or selected category.');
		}
	}

	// Handler for saving notes to the transaction
	function handleSaveNotes() {
		const currentTxnId = $uiStore.selectedTransactionId; // Get ID from uiStore
		if (currentTxnId) {
			// --- Call action on transactionStore ---
			transactionStore.addNotes(currentTxnId, notes); // Pass local notes state
			// Optional: Show feedback or close modal after update
		}
	}

	// Function to close the modal
	function closeModal() {
		// --- Call action on uiStore ---
		uiStore.closeDetails();
	}
</script>

{#if $uiStore.showTransactionDetails && selectedTransactionObject}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
		on:click|self={closeModal}
		on:keydown={(e) => {
			if (e.key === 'Escape') closeModal();
		}}
	>
		<div class="modal-content">
			<h3 id="modal-title">Transaction Details</h3>

			<div class="transaction-details">
				<p><strong>Date:</strong> {selectedTransactionObject.date}</p>
				<p><strong>Description:</strong> {selectedTransactionObject.description}</p>
				<p><strong>Type:</strong> {selectedTransactionObject.type || 'N/A'}</p>
				<p>
					<strong>Amount:</strong>
					<span
						class={selectedTransactionObject.direction === 'out'
							? 'expense-amount'
							: 'income-amount'}
					>
						{formatCurrency(selectedTransactionObject.amount, selectedTransactionObject.currency)}
					</span>
					{#if selectedTransactionObject.direction !== 'unknown'}
						({selectedTransactionObject.direction})
					{/if}
				</p>
			</div>

			<div class="category-selector">
				<label for="modal-category-select">
					<strong>Category:</strong>
					<div class="category-controls">
						<select
							id="modal-category-select"
							value={$uiStore.currentCategory}
							on:change={handleCategoryChange}
						>
							{#each $categories as category (category)}
								<option value={category}>{category}</option>
							{/each}
						</select>

						{#if llmAvailable}
							<button
								class="suggest-button"
								on:click={requestCategorySuggestion}
								disabled={suggestingCategory}
								title="Suggest category using AI"
							>
								{suggestingCategory ? 'Suggesting...' : 'Suggest'}
							</button>
						{/if}
					</div>
				</label>
				<button on:click={handleUpdateCategory} class="action-button update-button">
					Update Category
				</button>
			</div>

			<div class="notes-section">
				<label for="modal-notes-textarea">
					<strong>Notes:</strong>
					<textarea
						id="modal-notes-textarea"
						bind:value={notes}
						placeholder="Add notes about this transaction..."
						rows="3"
					></textarea>
				</label>
				<button on:click={handleSaveNotes} class="action-button save-button"> Save Notes </button>
			</div>

			<button class="close-button" on:click={closeModal}> Close </button>
		</div>
	</div>
{/if}

<style>
	/* Styles remain largely the same, minor adjustments for clarity */
	.modal-backdrop {
		position: fixed;
		inset: 0; /* Use inset for cleaner top/left/width/height */
		background-color: rgba(0, 0, 0, 0.6); /* Slightly darker backdrop */
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px; /* Add padding for smaller screens */
	}

	.modal-content {
		background-color: white;
		padding: 25px 30px; /* More padding */
		border-radius: 8px; /* Slightly larger radius */
		width: 100%; /* Responsive width */
		max-width: 500px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		gap: 15px; /* Add gap between sections */
	}

	h3 {
		margin-top: 0;
		margin-bottom: 10px; /* Adjust margin */
		color: #2c3e50;
		text-align: center;
		border-bottom: 1px solid #eee;
		padding-bottom: 10px;
	}

	.transaction-details p {
		margin: 5px 0; /* Consistent paragraph spacing */
		line-height: 1.5;
	}
	.transaction-details strong {
		color: #34495e; /* Slightly emphasize labels */
	}

	.expense-amount {
		color: #c0392b;
		font-weight: 600;
	}
	.income-amount {
		color: #27ae60;
		font-weight: 600;
	}

	.category-selector,
	.notes-section {
		margin-top: 10px; /* Reduced top margin */
		display: flex;
		flex-direction: column;
		gap: 8px; /* Reduced gap */
	}
	label {
		font-weight: bold;
		font-size: 0.9em;
		color: #555;
	}
	.category-controls {
		display: flex;
		gap: 10px;
		margin-top: 5px;
		align-items: center; /* Align select and button */
	}

	select,
	textarea {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid #ccc; /* Slightly darker border */
		border-radius: 4px;
		font-size: 14px;
		box-sizing: border-box;
	}
	select {
		flex-grow: 1; /* Allow select to take available space */
		cursor: pointer;
	}

	textarea {
		font-family: inherit; /* Use standard font */
		resize: vertical;
		min-height: 60px;
	}

	button {
		padding: 8px 15px;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
		font-size: 14px;
		align-self: flex-start; /* Align buttons left by default */
	}
	button:hover:not(:disabled) {
		filter: brightness(90%);
	}
	button:disabled {
		background-color: #bdc3c7;
		cursor: not-allowed;
		opacity: 0.7;
	}

	.action-button {
		/* Common style for update/save */
		background-color: #3498db; /* Blue */
		margin-top: 5px; /* Add small top margin */
	}
	.action-button:hover:not(:disabled) {
		background-color: #2980b9;
	}

	.suggest-button {
		background-color: #9b59b6; /* Purple */
		padding: 6px 10px;
		font-size: 0.9em;
		flex-shrink: 0; /* Prevent shrinking */
		align-self: center; /* Align with select */
		margin-top: 0; /* Remove top margin */
	}
	.suggest-button:hover:not(:disabled) {
		background-color: #8e44ad;
	}
	.suggest-button:disabled {
		background-color: #d1c4e9;
	}

	.close-button {
		margin-top: 15px; /* More space before close */
		background-color: #7f8c8d; /* Grey */
		align-self: flex-end; /* Align close button right */
	}
	.close-button:hover:not(:disabled) {
		background-color: #606d76;
	}
</style>
