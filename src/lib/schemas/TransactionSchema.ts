// src/lib/schemas/TransactionSchema.ts
import type { Category } from '$lib/stores/types';
import { z } from 'zod';

export const TransactionSchema = z.object({
	id: z.string().uuid({ message: 'Invalid transaction ID (must be UUID v4)' }),

	// --- Add this line ---
	batchId: z.string().uuid({ message: 'Invalid batch ID (must be UUID v4)' }),
	// --- End added line ---

	date: z.string().refine((val) => val === 'unknown' || /^\d{4}-\d{2}-\d{2}$/.test(val), {
		message: 'Date must be in YYYY-MM-DD format or "unknown"'
	}),
	description: z.string({
		required_error: 'Description is required',
		invalid_type_error: 'Description must be a string'
	}),
	type: z.string({ invalid_type_error: 'Type must be a string' }),
	amount: z
		.number({
			required_error: 'Amount is required',
			invalid_type_error: 'Amount must be a number'
		})
		.positive({ message: 'Amount must be positive (direction is handled separately)' })
		.or(z.literal(0)),
	category: z.string() as z.ZodType<Category>,
	notes: z.string({ invalid_type_error: 'Notes must be a string' }).default(''),
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
