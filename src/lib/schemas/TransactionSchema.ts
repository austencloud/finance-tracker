// src/lib/schemas/TransactionSchema.ts
import type { Category } from '$lib/stores/types';
import { z } from 'zod';

// Define categories explicitly for validation if needed, or use a broader string approach
// const validCategories = [...] // Your category list from types/transaction.ts

export const TransactionSchema = z.object({
	// Use uuid validation for ID
	id: z.string().uuid({ message: 'Invalid transaction ID (must be UUID v4)' }),

	// Validate date format or 'unknown'
	date: z.string().refine((val) => val === 'unknown' || /^\d{4}-\d{2}-\d{2}$/.test(val), {
		message: 'Date must be in YYYY-MM-DD format or "unknown"'
	}),

	description: z.string({
		required_error: 'Description is required',
		invalid_type_error: 'Description must be a string'
	}), // Allow "unknown" but require string

	type: z.string({ invalid_type_error: 'Type must be a string' }), // Allow "unknown" but require string

	amount: z
		.number({
			required_error: 'Amount is required',
			invalid_type_error: 'Amount must be a number'
		})
		.positive({ message: 'Amount must be positive (direction is handled separately)' })
		.or(z.literal(0)), // Allow 0 if truly unknown

	// If you want strict category validation:
	// category: z.enum(validCategories),
	// Or allow any string but refine later:
	category: z.string() as z.ZodType<Category>, // Cast for type inference if needed

	notes: z.string({ invalid_type_error: 'Notes must be a string' }).default(''), // Default to empty string

	direction: z.enum(['in', 'out', 'unknown'], {
		required_error: 'Direction (in/out/unknown) is required',
		invalid_type_error: 'Direction must be "in", "out", or "unknown"'
	})
});

// Schema for an array of transactions
export const TransactionArraySchema = z.array(TransactionSchema);

// Infer the TypeScript type from the schema
export type TransactionInput = z.input<typeof TransactionSchema>;
export type TransactionOutput = z.output<typeof TransactionSchema>; // Matches Transaction interface
