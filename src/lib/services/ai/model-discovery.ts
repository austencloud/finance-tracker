// src/lib/services/ai/model-discovery.ts

// --- Import specific store ---
// import { appStore } from '$lib/stores/AppStore'; // REMOVE old import
import { uiStore } from '$lib/stores/uiStore'; // ADD specific store import
import { get } from 'svelte/store'; // Keep get for reading store state

// --- Import other services/helpers ---
import { listOllamaModels } from './ollama-client'; // Adjust path if needed

/**
 * Discovers available Ollama models via the ollama-client
 * and adds any new ones found to the uiStore.
 *
 * @returns A promise that resolves with the list of model names found (or empty array on error).
 */
export async function discoverOllamaModels(): Promise<string[]> {
	try {
		// Fetch the list of models from the Ollama API client
		const models = await listOllamaModels();

		if (models && models.length > 0) {
			console.log(`[discoverOllamaModels] Found ${models.length} Ollama models:`, models);

			// --- Read current UI state directly from uiStore ---
			const currentUiState = get(uiStore);
			// Create a set of existing model IDs for efficient lookup
			const currentModelIds = new Set(currentUiState.availableModels.map((m) => m.id));

			// Iterate through discovered models
			for (const modelName of models) {
				// If the model isn't already in the store...
				if (!currentModelIds.has(modelName)) {
					console.log(`[discoverOllamaModels] Adding new model: ${modelName}`);
					// --- Use the uiStore action to add the model ---
					// Note: The refactored action assumes 'ollama' backend
					uiStore.addCustomOllamaModel(modelName, false); // Add without auto-selecting
					currentModelIds.add(modelName); // Add to set to prevent re-adding in this loop
				}
			}
		} else {
			console.warn('[discoverOllamaModels] No models found or Ollama not available.');
		}

		// Return the list of discovered models (or empty array)
		return models || [];
	} catch (error) {
		console.error('[discoverOllamaModels] Error discovering Ollama models:', error);
		// Return empty array on error to avoid breaking callers
		return [];
	}
}

/**
 * Initializes model discovery on application startup.
 * Calls discoverOllamaModels and logs success or failure.
 */
export async function initializeModelDiscovery(): Promise<void> {
	try {
		await discoverOllamaModels();
		console.log('[initializeModelDiscovery] Initial Ollama model discovery complete.');
	} catch (error) {
		// Log warning, but don't block app startup
		console.warn('[initializeModelDiscovery] Initial model discovery failed:', error);
	}
}
