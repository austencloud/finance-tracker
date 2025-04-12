<!-- src/lib/components/transactions/TransactionModal.svelte -->
<script lang="ts">
	import {
		showTransactionDetails,
		selectedTransaction,
		currentCategory,
		assignCategory,
		addNotes
	} from '$lib/stores';
	import { categories } from '$lib/stores/transactionStore';
	import { suggestCategory, isLLMAvailable } from '$lib/services/ai';

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

	// Run the check when component mounts
	checkLLMAvailability();

	// Update notes when a transaction is selected
	$: if ($selectedTransaction) {
		notes = $selectedTransaction.notes || '';
	}

	// Request a category suggestion from the LLM
	async function requestCategorySuggestion() {
		if (!$selectedTransaction || !llmAvailable) return;

		suggestingCategory = true;
		try {
			const suggested = await suggestCategory($selectedTransaction);
			$currentCategory = suggested;
		} catch (error) {
			console.error('Error getting category suggestion:', error);
		} finally {
			suggestingCategory = false;
		}
	}
</script>

{#if $showTransactionDetails && $selectedTransaction}
	<div class="modal-backdrop">
		<div class="modal-content">
			<h3>Transaction Details</h3>
			<div class="transaction-details">
				<p><strong>Date:</strong> {$selectedTransaction.date}</p>
				<p><strong>Description:</strong> {$selectedTransaction.description}</p>
				<p><strong>Type:</strong> {$selectedTransaction.type}</p>
				<p>
					<strong>Amount:</strong>
					<span
						class={$selectedTransaction.category === 'Expenses'
							? 'expense-amount'
							: 'income-amount'}
					>
						${parseFloat($selectedTransaction.amount.toString().replace(/[$,]/g, '')).toFixed(2)}
					</span>
				</p>

				<div class="category-selector">
					<label>
						<strong>Category:</strong>
						<div class="category-controls">
							<select bind:value={$currentCategory}>
								{#each categories as category}
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
					<button
						on:click={() => {
							assignCategory($selectedTransaction, $currentCategory);
						}}
					>
						Update Category
					</button>
				</div>

				<div class="notes-section">
					<label>
						<strong>Notes:</strong>
						<textarea bind:value={notes} placeholder="Add notes about this transaction..." rows="3"
						></textarea>
					</label>
					<button
						on:click={() => {
							addNotes($selectedTransaction, notes);
						}}
					>
						Save Notes
					</button>
				</div>
			</div>

			<button class="close-button" on:click={() => ($showTransactionDetails = false)}>
				Close
			</button>
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
