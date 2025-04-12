<!-- src/lib/components/input/LLMConversation/LLMConversationLayout.svelte -->
<script lang="ts">
	import LLMHeader from './LLMHeader.svelte';
	import LLMMessageList from './LLMMessageList.svelte';
	import LLMInputBar from './LLMInputBar.svelte';
</script>

<div class="conversation-container-embedded">
	<LLMHeader />
	<LLMMessageList />
	<LLMInputBar />
</div>

<style>
	.conversation-container-embedded {
		height: 60vh;
		min-height: 400px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		border: 1px solid #e0e0e0;
		border-radius: 5px;
		background-color: #f8f9fa;
	}
</style>
