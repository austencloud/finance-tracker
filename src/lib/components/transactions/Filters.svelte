<script lang="ts">
	// --- Import appStore directly ---
	import { appStore } from '$lib/stores/AppStore';
	import type { Category } from '$lib/types/types'; // Keep type import

	// Helper function for type safety with event target value
	function handleSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		appStore.setSearchTerm(target.value);
	}

	function handleCategoryChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		// Ensure the value is treated as the correct type before calling action
		appStore.setFilterCategory(target.value as 'all' | Category);
	}
</script>

{#if $appStore.transactions.length > 0}
	<div class="filters">
		<div class="search-filter">
			<input
				type="text"
				placeholder="Search transactions..."
				value={$appStore.filters.searchTerm}
				on:input={handleSearchInput}
			/>
		</div>

		<div class="category-filter">
			<select value={$appStore.filters.category} on:change={handleCategoryChange}>
				<option value="all">All Categories</option>
				{#each $appStore.categories as category (category)}
					<option value={category}>{category}</option>
				{/each}
			</select>
		</div>
	</div>
{/if}

<style>
	/* Styles remain unchanged */
	.filters {
		display: flex;
		gap: 15px;
		margin-bottom: 15px;
		flex-wrap: wrap;
	}

	.search-filter {
		flex: 1;
		min-width: 200px;
	}

	.search-filter input {
		width: 100%;
		padding: 8px;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.category-filter {
		width: 200px;
	}

	select {
		width: 100%;
		padding: 8px;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	@media (max-width: 768px) {
		.filters {
			flex-direction: column;
		}

		.category-filter {
			width: 100%;
		}
	}
</style>
