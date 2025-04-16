// tests/unit/services/ai/extraction/llm-parser.test.ts
import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator
import {
	parseTransactionsFromLLMResponse,
	fixCommonJsonErrors
} from '$lib/services/ai/extraction/llm-parser'; // Adjust path if needed

// ... tests for fixCommonJsonErrors ...

describe('parseTransactionsFromLLMResponse', () => {
	it('should parse valid transaction data', () => {
		const input = JSON.stringify({
			transactions: [
				{
					date: '2024-04-01',
					description: 'Grocery store',
					details: 'Weekly shopping',
					type: 'Card',
					amount: 47.85,
					direction: 'OUT' // LLM might output uppercase
				}
			]
		});
		const batchId = uuidv4(); // <-- Generate batchId

		// Pass batchId to the function
		const result = parseTransactionsFromLLMResponse(input, batchId); // <-- Pass batchId

		expect(result).toHaveLength(1);
		expect(result[0].description).toBe('Grocery store');
		expect(result[0].amount).toBe(47.85);
		expect(result[0].batchId).toBe(batchId); // <-- Verify batchId
		expect(result[0].direction).toBe('out'); // Expect lowercase after conversion
	});

	it('should handle messy LLM responses', () => {
		// Example with potential issues fixCommonJsonErrors might handle
		const input = `
        \`\`\`json
        { // Some leading comment maybe
          "transactions": [
            { date: "2024-04-01", "description": "Coffee shop", "details": None, type: "unknown", "amount": 5.75, direction: "OUT" },
          ], // Trailing comma
        }
        \`\`\`
        Some trailing text.
        `;
		const batchId = uuidv4(); // <-- Generate batchId

		// Pass batchId to the function
		const result = parseTransactionsFromLLMResponse(input, batchId); // <-- Pass batchId

		expect(result).toHaveLength(1);
		expect(result[0].amount).toBe(5.75);
		expect(result[0].batchId).toBe(batchId); // <-- Verify batchId
		expect(result[0].notes).toBe(''); // Details: None becomes notes: ''
	});

	// Add tests for empty input, invalid JSON, validation failures etc.
	it('should return empty array for invalid JSON', () => {
		const input = '{"transactions": [invalid json}}';
		const batchId = uuidv4();
		const result = parseTransactionsFromLLMResponse(input, batchId);
		expect(result).toHaveLength(0);
	});

	it('should return empty array if Zod validation fails (e.g., missing required field)', () => {
		const input = JSON.stringify({
			transactions: [{ description: 'Missing amount', date: '2024-01-01', direction: 'out' }]
		});
		const batchId = uuidv4();
		const result = parseTransactionsFromLLMResponse(input, batchId);
		// Note: Depending on schema, amount might default causing different failure
		expect(result).toHaveLength(0);
	});
});
