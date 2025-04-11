<script>
	// You can add global styles or layout elements here
</script>

<slot />

<style>
	/* Global styles */
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: Arial, sans-serif;
		background-color: #f9f9f9;
	}

	:global(*) {
		box-sizing: border-box;
	}
</style>
