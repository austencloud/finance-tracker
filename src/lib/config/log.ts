export const LOG_LEVEL =
	typeof import.meta !== 'undefined' && import.meta.env.VITE_LOG_LEVEL
		? import.meta.env.VITE_LOG_LEVEL
		: 'info';

export const logDebug = (...args: unknown[]) => {
	if (LOG_LEVEL === 'debug') console.debug(...args);
};
