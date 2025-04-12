// src/lib/stores/uiStore.ts
import { writable } from 'svelte/store';

// General UI state
export const loading = writable(false);
export const showSuccessMessage = writable(false);