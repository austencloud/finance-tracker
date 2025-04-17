<script lang="ts">
	// --- Import specific stores ---
	// import { appStore } from '$lib/stores/AppStore'; // REMOVE old monolithic store
	import { filterStore } from '$lib/stores/filterStore';
	import { categories } from '$lib/stores/categoryStore';
	import { transactionStore } from '$lib/stores/transactionStore';

	// --- Import Types ---
	import type { Category } from '$lib/types/types'; // Adjust path if needed

	// --- Event Handlers ---

	/**
	 * Updates the search term in the filterStore when the input changes.
	 * @param event - The input event from the text input.
	 */
	function handleSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		// --- Call action on the specific filterStore ---
		filterStore.setSearchTerm(target.value);
	}

	/**
	 * Updates the selected category in the filterStore when the selection changes.
	 * @param event - The change event from the select element.
	 */
	function handleCategoryChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		// --- Call action on the specific filterStore ---
		// Cast value to the expected type for the store action
		filterStore.setCategory(target.value as 'all' | Category);
	}
</script>

{#if $transactionStore.length > 0} <div class="filters">
		<div class="search-filter">
			<label for="search-filter-input" class="visually-hidden">Search Transactions</label>
			<input
				id="search-filter-input"
				type="text"
				placeholder="Search descriptions, dates, notes..."
				value={$filterStore.searchTerm} on:input={handleSearchInput}
                aria-label="Search transactions"
			/>
		</div>

		<div class="category-filter">
            <label for="category-filter-select" class="visually-hidden">Filter by Category</label>
			<select
                id="category-filter-select"
                value={$filterStore.category} on:change={handleCategoryChange}
                aria-label="Filter by category"
            >
				<option value="all">All Categories</option>
				{#each $categories as category (category)}
					<option value={category}>{category}</option>
				{/each}
			</select>
		</div>
	</div>
{/if}

<style>
	/* Styles remain the same */
	.filters {
		display: flex;
		gap: 15px;
		margin-bottom: 15px;
		flex-wrap: wrap;
	}

	.search-filter {
		flex: 1; /* Allow search to grow */
		min-width: 200px;
	}

	.search-filter input {
		width: 100%;
		padding: 8px 10px; /* Adjust padding */
		border: 1px solid #ddd;
		border-radius: 4px;
        box-sizing: border-box; /* Include padding in width */
        font-size: 14px;
	}

	.category-filter {
		min-width: 200px; /* Ensure minimum width */
        width: auto; /* Allow shrinking */
        flex-basis: 200px; /* Base width */
	}

	select {
		width: 100%;
		padding: 8px 10px; /* Match input padding */
		border: 1px solid #ddd;
		border-radius: 4px;
        background-color: white; /* Ensure background */
        font-size: 14px;
        cursor: pointer;
        box-sizing: border-box;
	}

    /* Visually hidden label for accessibility */
    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }


	@media (max-width: 768px) {
		.filters {
			flex-direction: column;
		}
        /* Ensure filters take full width on small screens */
		.search-filter,
		.category-filter {
			width: 100%;
            flex-basis: auto;
		}
	}
</style>
