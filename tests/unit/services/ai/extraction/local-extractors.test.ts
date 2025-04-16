// tests/unit/services/ai/extraction/local-extractors.test.ts
import { describe, it, expect } from 'vitest'; // or Jest
import { extractBankStatementFormat } from '$lib/services/ai/extraction/local-extractors';

describe('extractBankStatementFormat', () => {
	it('should extract transactions from standard bank format', () => {
		const input = `
Jan 12, 2024
Zelle payment from CHRISTINA A VALDES 19564849510
Zelle credit
$197.00

01/12/2024
Zelle payment from TIMOTHY J PEARCE 19563839574
Zelle credit
$75.00
    `;

		const result = extractBankStatementFormat(input);

		expect(result.length).toBe(2);
		expect(result[0].date).toBe('2024-01-12');
		expect(result[0].amount).toBe(197.0);
		expect(result[0].direction).toBe('in');
		expect(result[0].description).toBe('Zelle payment from CHRISTINA A VALDES 19564849510');

		expect(result[1].date).toBe('2024-01-12');
		expect(result[1].amount).toBe(75.0);
	});

	it('should handle empty input', () => {
		expect(extractBankStatementFormat('')).toEqual([]);
	});

	// Add more test cases for different formats, edge cases, etc.
});
