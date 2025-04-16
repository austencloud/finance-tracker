// src/lib/services/ai/model-discovery.ts

import { appStore } from '$lib/stores/AppStore';
import { get } from 'svelte/store';
import { listOllamaModels } from './ollama-client';

/**
 * Discovers available Ollama models and adds them to the appStore
 */
export async function discoverOllamaModels(): Promise<string[]> {
	try {
		const models = await listOllamaModels();

		if (models && models.length > 0) {
			console.log(`[discoverOllamaModels] Found ${models.length} Ollama models:`, models);

			// Get the current models from the store to avoid duplicates
			const currentState = get(appStore);
			const currentModelIds = new Set(currentState.ui.availableModels.map((m) => m.id));

			// Add each newly discovered model that doesn't already exist
			for (const modelName of models) {
				if (!currentModelIds.has(modelName)) {
					// Use the appStore's addCustomModel method to add the model
					appStore.addCustomModel(modelName, 'ollama', false); // Don't auto-select
					currentModelIds.add(modelName); // Update our tracking set
				}
			}
		} else {
			console.warn('[discoverOllamaModels] No models found or Ollama not available');
		}

		return models || [];
	} catch (error) {
		console.error('[discoverOllamaModels] Error discovering Ollama models:', error);
		return [];
	}
}

/**
 * Updates the ModelSelector component with a refresh button
 */
export async function initializeModelDiscovery(): Promise<void> {
	try {
		await discoverOllamaModels();
		console.log('[initializeModelDiscovery] Initial Ollama model discovery complete');
	} catch (error) {
		console.warn('[initializeModelDiscovery] Initial model discovery failed:', error);
	}
}
