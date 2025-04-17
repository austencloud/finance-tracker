<script lang="ts">
	// --- Import specific store ---
	// import { appStore } from '$lib/stores/AppStore'; // REMOVE old import
	import { conversationStore } from '$lib/stores/conversationStore'; // ADD specific store import

	// --- Component Imports ---

	// --- Local State ---
	let copySuccess = false; // For showing copy feedback

	// --- Functions ---

	// Function to handle copying conversation content
	function copyConversation() {
		// Read messages directly from the conversationStore
		const messages = $conversationStore.messages; // Use conversationStore
		if (!messages || messages.length === 0) return;

		// Format messages for copying (logic remains the same)
		const formattedContent = messages
			.map((msg) => {
				const role = msg.role === 'user' ? 'You' : 'Assistant';
				// Ensure content is a string before using it
				const contentString = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
				return `${role}: ${contentString}`;
			})
			.join('\n\n');

		// Copy to clipboard (logic remains the same)
		navigator.clipboard
			.writeText(formattedContent)
			.then(() => {
				showCopySuccess(); // Trigger local UI feedback
			})
			.catch((err) => {
				console.error('Failed to copy conversation:', err);
				// TODO: Optionally show an error message to the user
			});
	}

	// Show temporary success message (local UI logic)
	function showCopySuccess() {
		copySuccess = true;
		setTimeout(() => {
			copySuccess = false;
		}, 2000); // Hide after 2 seconds
	}
</script>

<div class="conversation-header-embedded">
	<h4>AI Transaction Assistant</h4>
	<div class="header-controls">
        <button
			class="copy-button"
			on:click={copyConversation}
			aria-label="Copy conversation"
			title="Copy conversation to clipboard"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
				<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
			</svg>
			{#if copySuccess}
				<span class="copy-success">✓</span>
			{/if}
		</button>
	</div>
</div>

{#if $conversationStore.progress > 0}  <div class="progress-container">
		<div class="progress-bar" style="width: {$conversationStore.progress}%"></div> </div>
{/if}

{#if $conversationStore.status && $conversationStore.status !== 'Thinking…'} <div class="status-message">{$conversationStore.status}</div> {/if}

<style>
	/* Styles remain the same */
	.conversation-header-embedded {
		padding: 10px 15px;
		background-color: #eaf2f8; /* Light blue background */
		color: #2c3e50; /* Dark text */
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #ddd;
		flex-shrink: 0; /* Prevent shrinking */
	}
	.conversation-header-embedded h4 {
		margin: 0;
		font-size: 16px; /* Slightly larger */
		font-weight: 600; /* Medium weight */
	}
	.header-controls {
		display: flex;
		align-items: center;
		gap: 10px; /* Space between controls */
	}
	.copy-button {
		display: flex;
		align-items: center;
		background-color: transparent;
		border: 1px solid #2c3e50;
		border-radius: 4px;
		padding: 4px 8px;
		color: #2c3e50;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative; /* For positioning the success indicator */
	}
	.copy-button:hover {
		background-color: rgba(44, 62, 80, 0.1);
	}
	.copy-success {
		position: absolute;
		top: -5px;
		right: -5px;
		background-color: #2ecc71; /* Green */
		color: white;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fade-in-out 2s ease;
	}
	@keyframes fade-in-out {
		0% { opacity: 0; }
		20% { opacity: 1; }
		80% { opacity: 1; }
		100% { opacity: 0; }
	}
	.progress-container {
		height: 4px;
		background-color: #e0e0e0;
		width: 100%;
		flex-shrink: 0;
	}
	.progress-bar {
		height: 100%;
		background-color: #2ecc71; /* Green */
		transition: width 0.3s ease;
		border-radius: 0 2px 2px 0;
	}
	.status-message {
		font-size: 13px;
		color: #555;
		text-align: center;
		padding: 5px 10px;
		background-color: #f8f9fa;
		border-bottom: 1px solid #eee;
		flex-shrink: 0;
		line-height: 1.3;
		font-style: italic;
	}
</style>
