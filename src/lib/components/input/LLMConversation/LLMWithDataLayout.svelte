<!-- src/lib/components/input/LLMConversation/LLMWithDataLayout.svelte -->
<script lang="ts">
	// Import the existing conversation layout component
	import LLMConversationLayout from './LLMConversationLayout.svelte';
	// Import the new data display component we just created
	import ExtractedDataDisplay from './ExtractedDataDisplay.svelte';
	// Import the model install helper
	import ModelInstallHelper from './ModelInstallHelper.svelte';
</script>

<div class="llm-with-data-container">
	<div class="left-pane">
		<LLMConversationLayout />
		<ModelInstallHelper />
	</div>

	<div class="right-pane">
		<ExtractedDataDisplay />
	</div>
</div>

<style>
	.llm-with-data-container {
		display: flex; /* Use flexbox for side-by-side layout */
		gap: 20px; /* Space between the two panes */
		padding: 15px; /* Optional padding around the whole area */
		/* Optional: Constrain width and center */
		/* max-width: 1500px; */
		/* margin: 20px auto; */
	}

	.left-pane {
		flex: 3; /* Give chat pane more space (adjust ratio as needed) */
		/* Or use percentage width: width: 60%; */
		min-width: 0; /* Prevent flex items from overflowing */
		display: flex;
		flex-direction: column;
	}

	.right-pane {
		flex: 2; /* Give data pane less space (adjust ratio as needed) */
		/* Or use percentage width: width: 40%; */
		min-width: 0; /* Prevent flex items from overflowing */
	}

	/* Basic responsive behavior: stack panes on smaller screens */
	@media (max-width: 900px) {
		.llm-with-data-container {
			flex-direction: column;
			gap: 15px;
		}
		.left-pane,
		.right-pane {
			flex: 1; /* Reset flex ratio when stacked */
			width: 100%; /* Take full width when stacked */
		}
	}
</style>
