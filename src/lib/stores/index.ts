// src/lib/stores/index.ts
// Export our new centralized store
export { appStore } from './AppStore';

// Export all the legacy adapters for backward compatibility

// Eventually when migration is complete, we'll remove the adapters
// and only export the appStore