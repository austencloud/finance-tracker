<script lang="ts">
	// Imports are correct - they use the adapters from $lib/stores
	import { transactions, filterCategory, searchTerm, categories } from '$lib/stores';
	import type { Category } from '$lib/stores/types'; // Import Category type if needed
</script>

{#if $transactions.length > 0}
	<div class="filters">
		<div class="search-filter">
			<input type="text" placeholder="Search transactions..." bind:value={$searchTerm} />
		</div>

		<div class="category-filter">
			<select bind:value={$filterCategory}>
				<option value="all">All Categories</option>
				{#each $categories as category (category)}
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
