// src/lib/services/ai/conversation/bulk/llmChunkTransactions.ts

// Keep the existing splitByTransactionStart function from the previous fix
// as it correctly identifies individual transaction blocks.

/**
 * Identifies blocks of text that likely represent individual transactions
 * based on lines starting with a date pattern (MM/DD/YYYY).
 * [Function code from previous successful fix - no changes needed here]
 * @param text The raw input text potentially containing many transactions.
 * @returns An array of strings, where each string is a potential transaction block.
 */
function splitByTransactionStart(text: string): string[] {
	// ... (Keep the implementation from the previous response) ...
	if (!text || !text.trim()) {
		return [];
	}
	const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}/gm;
	const blocks: string[] = [];
	const matches = [];
	let match;
	while ((match = dateRegex.exec(text)) !== null) {
		matches.push(match.index);
	}

	if (matches.length === 0) {
		const blankLineSplit = text
			.split(/\n\s*\n/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		if (blankLineSplit.length > 1) {
			console.warn(
				'[splitByTransactionStart] No MM/DD/YYYY found, falling back to splitting by blank lines.'
			);
			return blankLineSplit;
		} else {
			console.warn(
				'[splitByTransactionStart] No MM/DD/YYYY found and no blank lines found, returning text as single block.'
			);
			// Return single block only if non-empty after trim
			const trimmedText = text.trim();
			return trimmedText ? [trimmedText] : [];
		}
	}
	if (matches[0] > 0) {
		const firstBlock = text.substring(0, matches[0]).trim();
		if (firstBlock) {
			console.warn('[splitByTransactionStart] Found text before the first date:', firstBlock);
			blocks.push(firstBlock); // Include potentially malformed leading content
		}
	}
	for (let i = 0; i < matches.length; i++) {
		const startIndex = matches[i];
		const endIndex = i + 1 < matches.length ? matches[i + 1] : text.length;
		const block = text.substring(startIndex, endIndex).trim();
		if (block) {
			blocks.push(block);
		}
	}
	return blocks.filter((b) => b.length > 0);
}

/**
 * Chunks a raw input text into smaller segments suitable for LLM processing,
 * aiming for a specific number of transactions per chunk.
 * It first splits the text into blocks based on lines starting with a date
 * pattern (MM/DD/YYYY). It then groups these transaction blocks into chunks
 * containing a target number of transactions.
 *
 * @param text The raw user input potentially containing many transactions.
 * @param transactionsPerChunk Optional target number of transactions per chunk (default: 3).
 * @returns Array of text chunks suitable for individual processing.
 */
export async function llmChunkTransactions(
	text: string,
	transactionsPerChunk = 3 // Target 2-3 transactions, default to 3
): Promise<string[]> {
	if (!text || !text.trim()) {
		return [];
	}
	if (transactionsPerChunk <= 0) {
		console.warn('llmChunkTransactions: transactionsPerChunk must be positive, defaulting to 3.');
		transactionsPerChunk = 3;
	}

	// Step 1: Split the text into blocks based on transaction start (date pattern)
	const transactionBlocks = splitByTransactionStart(text);

	if (transactionBlocks.length === 0) {
		console.warn('llmChunkTransactions: splitByTransactionStart returned zero blocks.');
		return [];
	}

	// Step 2: Group these blocks by the target transaction count
	const chunks: string[] = [];
	let currentChunkBlocks: string[] = [];

	for (const block of transactionBlocks) {
		currentChunkBlocks.push(block);
		// When the current chunk reaches the desired size, finalize it
		if (currentChunkBlocks.length === transactionsPerChunk) {
			chunks.push(currentChunkBlocks.join('\n\n')); // Join blocks with double newline
			currentChunkBlocks = []; // Reset for the next chunk
		}
	}

	// Add any remaining blocks as the last chunk if they exist
	if (currentChunkBlocks.length > 0) {
		chunks.push(currentChunkBlocks.join('\n\n'));
	}

	console.log(
		`llmChunkTransactions: Created ${chunks.length} chunks with target ${transactionsPerChunk} transactions per chunk.`
	);
	return chunks;
}
