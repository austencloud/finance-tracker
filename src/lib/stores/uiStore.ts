// src/lib/stores/uiStore.ts
import { writable, get } from 'svelte/store';
import type { UIState, Category } from '../types/types'; // Adjust path
import { OLLAMA_CONFIG } from '$lib/config/ai-config'; // Adjust path
import { categories } from './categoryStore'; // Import categories for default

// Get initial category safely
const initialCats = get(categories);
const defaultCategory = initialCats.includes('Expenses') ? 'Expenses' : initialCats[0] || 'Other / Uncategorized';

const initialState: UIState = {
	loading: false,
	showSuccessMessage: false,
	selectedTransactionId: null,
	showTransactionDetails: false,
	currentCategory: defaultCategory,
	selectedModel: OLLAMA_CONFIG.model, // Default model from config
	availableModels: [{ id: OLLAMA_CONFIG.model, name: OLLAMA_CONFIG.model, backend: 'ollama' }] // Start with default
};

const { subscribe, update } = writable<UIState>(initialState);

export const uiStore = {
	subscribe,
	setLoading: (loading: boolean) => {
		update((s) => ({ ...s, loading }));
	},
	showSuccessMessage: (show: boolean) => {
 		update((s) => ({ ...s, showSuccessMessage: show }));
 	},
	// Renamed from selectTransaction to avoid conflict
	selectTransactionForDetails: (transactionId: string | null) => {
		// This action now needs to read transaction state to get the category
		// It's often better to handle this in the component calling the action,
		// or pass the whole transaction object here.
		// Let's simplify and just handle ID/visibility here.
		update((s) => ({
            ...s,
            selectedTransactionId: transactionId,
            showTransactionDetails: !!transactionId,
            // Reset modal category or set from selected txn - requires txn data access
            // For simplicity, we might reset it here and let the modal set it
             currentCategory: defaultCategory // Reset to default when opening/closing
        }));
        // If you need the category, the component opening the modal should probably
        // get the transaction and call setModalCategory separately.
	},
    // New action specifically for clearing selection if ID matches
    clearSelectionIfMatches: (idToClear: string) => {
        update(s => {
            if (s.selectedTransactionId === idToClear) {
                return {
                    ...s,
                    selectedTransactionId: null,
                    showTransactionDetails: false,
                    currentCategory: defaultCategory // Reset category
                };
            }
            return s; // No change
        });
    },
	closeDetails: () => {
		update((s) => ({
			...s,
			selectedTransactionId: null,
			showTransactionDetails: false,
            currentCategory: defaultCategory // Reset category
		}));
	},
	setModalCategory: (category: Category) => {
		// Optional: Validate against current categories from categoryStore if needed
        update((s) => ({ ...s, currentCategory: category }));
	},
	setSelectedModel: (modelId: string) => {
		update((s) => {
			const exists = s.availableModels.some((m) => m.id === modelId);
			return exists ? { ...s, selectedModel: modelId } : s;
		});
	},
	addAvailableModel: (model: { id: string; name: string; backend: 'ollama' | 'deepseek' }) => {
        update(s => {
             if (!s.availableModels.some(m => m.id === model.id)) {
                 return { ...s, availableModels: [...s.availableModels, model] };
             }
             return s; // Don't add duplicates
        });
    },
	addCustomOllamaModel: (modelId: string, autoSelect = true) => {
		const trimmedId = modelId.trim();
		if (!trimmedId) return;
		update((s) => {
			if (s.availableModels.some((m) => m.id === trimmedId)) return s; // Don't add duplicates
            const newModel = { id: trimmedId, name: trimmedId, backend: 'ollama' as const };
			return {
				...s,
				selectedModel: autoSelect ? trimmedId : s.selectedModel,
				availableModels: [...s.availableModels, newModel]
			};
		});
	}
};
