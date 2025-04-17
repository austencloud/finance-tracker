module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:svelte/recommended', // Essential for Svelte
		'prettier' // Add prettier last to override style rules
	],
	plugins: ['@typescript-eslint'],
	ignorePatterns: ['*.cjs'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2021,
		extraFileExtensions: ['.svelte'] // Tell ESLint to check .svelte files
	},
	env: {
		browser: true,
		es2017: true,
		node: true
	},
	overrides: [
		// Ensure Svelte files are parsed correctly
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				parser: '@typescript-eslint/parser'
			}
		}
	]
};
