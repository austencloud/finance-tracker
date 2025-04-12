<script lang="ts">
	// Import the main two-pane layout component we created
	import LLMWithDataLayout from '$lib/components/input/LLMConversation/LLMWithDataLayout.svelte';
	// Import the function to initialize the conversation state
	import { initializeConversation } from '$lib/services/ai/conversation';
	import { onMount } from 'svelte';
  
	// Initialize the conversation logic when this page component mounts
	onMount(() => {
	  initializeConversation();
	});
  
	// You can keep other imports if needed for actions on this page,
	// but the UI components like Tables, Filters, Modals will likely
	// be part of a different view or integrated differently now.
	// For example, if you want buttons outside the LLM interface:
	import { transactions, categoryTotals } from '$lib/stores'; // Assuming these are still relevant
	import { exportAsJson, generateHTMLReport } from '$lib/services/exporter';
	import { clearTransactions } from '$lib/stores/transactionStore'; // Correct path assumed
  
  </script>
  
  <main class="page-container">
	<h1>AI Transaction Entry</h1>
  
	<LLMWithDataLayout />
  
	<div class="global-actions">
	  <h2>Global Actions</h2>
	   <button
		  on:click={() => exportAsJson($transactions)}
		  disabled={$transactions.length === 0}
		  class="action-button export-action"
		>
		  Export JSON (All)
		</button>
		<button
		  on:click={() => generateHTMLReport($transactions, $categoryTotals)}
		  disabled={$transactions.length === 0}
		  class="action-button primary-action"
		>
		  Generate HTML Report (All)
		</button>
		<button
		  on:click={clearTransactions}
		  disabled={$transactions.length === 0}
		  class="action-button danger-action"
		>
		  Clear All Transactions
		</button>
	</div>
  
	</main>
  
  <style>
	.page-container {
	  max-width: 1400px; /* Adjust max-width to accommodate the wider two-pane layout */
	  margin: 0 auto;
	  padding: 20px;
	  font-family: Arial, sans-serif;
	  color: #333;
	}
  
	h1 {
	  text-align: center;
	  color: #2c3e50;
	  margin-bottom: 30px;
	}
  
	.global-actions {
	  margin-top: 30px;
	  padding-top: 20px;
	  border-top: 1px solid #eee;
	  display: flex;
	  gap: 10px;
	  flex-wrap: wrap;
	  align-items: center; /* Center items vertically */
	}
  
	.global-actions h2 {
		margin: 0;
		margin-right: 15px; /* Space between title and buttons */
		font-size: 1.1em;
		color: #34495e;
	}
  
	.action-button {
	   padding: 8px 15px;
	   color: white;
	   border: none;
	   border-radius: 4px;
	   cursor: pointer;
	   transition: background-color 0.2s;
	   font-size: 14px;
	}
  
	 .action-button:disabled {
	   background-color: #95a5a6;
	   cursor: not-allowed;
	 }
  
	 .primary-action {
	   background-color: #2ecc71;
	 }
	 .primary-action:hover:not(:disabled) {
	   background-color: #27ae60;
	 }
  
	 .danger-action {
	   background-color: #e74c3c;
	 }
	 .danger-action:hover:not(:disabled) {
	   background-color: #c0392b;
	 }
  
	 .export-action {
	   background-color: #f39c12;
	 }
	 .export-action:hover:not(:disabled) {
	   background-color: #d35400;
	 }
  
  </style>
  