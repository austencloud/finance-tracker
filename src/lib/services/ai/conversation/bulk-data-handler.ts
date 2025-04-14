// src/lib/services/ai/conversation/bulk-data-handler.ts
import { get } from 'svelte/store';
import {
	conversationStatus,
	conversationProgress,
	extractedTransactions,
	setState
} from '../conversation';
import { isBulkData, safeAddAssistantMessage } from './conversation-helpers';
import { BULK_DATA_THRESHOLD_LINES } from './constants';
import type { Transaction } from '$lib/types';
import { extractTransactionsFromText } from '../extraction/orchestrator';

export function startBackgroundProcessing(message: string): { handled: boolean; response: string } {
	if (!isBulkData(message)) {
		return { handled: false, response: '' };
	}

	// Give immediate feedback to the user
	conversationStatus.set('Processing your bank statement...');
	conversationProgress.set(10);

	// Set a realistic processing expectation
	const estimatedTime = Math.round(message.length / 500); // roughly estimate processing time
	const immediateResponse = `I'm analyzing your bank statement now. This will take about ${estimatedTime} seconds. I'll update you as I process the data.`;

	// Start processing in the background
	setTimeout(async () => {
		try {
			// Start the actual processing
			const smartChunks = smartChunkTransactionData(message);
			const totalChunks = smartChunks.length;

			if (totalChunks === 0) {
				conversationStatus.set('');
				conversationProgress.set(0);
				safeAddAssistantMessage('No processable transaction data found in your input.');
				return;
			}

			let processedChunks = 0;
			const allExtractedTxns: Transaction[] = [];

			// Process one chunk at a time, with UI updates between chunks
			for (let i = 0; i < totalChunks; i++) {
				const chunk = smartChunks[i];

				// Update progress after each chunk (looks more responsive)
				processedChunks++;
				const progressPercent = Math.round((processedChunks / totalChunks) * 100);
				conversationProgress.set(progressPercent);
				conversationStatus.set(`Processing your transactions (${progressPercent}%)...`);

				try {
					// Process in batches of 100ms to keep the UI responsive
					await new Promise((resolve) => setTimeout(resolve, 10));

					const chunkResult = await extractTransactionsFromText(chunk);
					if (chunkResult && chunkResult.length > 0) {
						allExtractedTxns.push(...chunkResult);

						// Give incremental updates for large files
						if (totalChunks > 3 && processedChunks % 2 === 0) {
							safeAddAssistantMessage(
								`Still working... I've found ${allExtractedTxns.length} transactions so far. (${progressPercent}% complete)`
							);
						}
					}
				} catch (error) {
					console.error(`[background] Error processing chunk ${i + 1}/${totalChunks}:`, error);
				}
			}

			// Deduplicate transactions
			const uniqueTransactions = deduplicateTransactions(allExtractedTxns);

			// Add to store
			if (uniqueTransactions.length > 0) {
				extractedTransactions.update((txns) => [...txns, ...uniqueTransactions]);
				const categoryBreakdown = getCategoryBreakdown(uniqueTransactions);

				safeAddAssistantMessage(
					`Finished processing your bank statement! I found ${uniqueTransactions.length} unique transactions.\n\n` +
						`${categoryBreakdown}\n\n` +
						`You can now see all transactions in the panel on the right. Would you like me to help you analyze this data?`
				);
			} else {
				safeAddAssistantMessage(
					`I processed your bank statement but couldn't extract any valid transactions. ` +
						`Please check the format or try a different statement.`
				);
			}

			// Reset progress indicators
			conversationProgress.set(0);
			conversationStatus.set('');
			setState({ initialPromptSent: true });
		} catch (error) {
			console.error('[background] Error in background processing:', error);
			conversationProgress.set(0);
			conversationStatus.set('');
			safeAddAssistantMessage(
				'Sorry, I encountered an error while processing your bank statement. Please try again with a smaller amount of data.'
			);
		}
	}, 50); // Small delay to let the UI update first

	return { handled: true, response: immediateResponse };
}

/**
 * Generate a summary of transactions by category
 */
function getCategoryBreakdown(transactions: Transaction[]): string {
	const categories = new Map<string, { count: number; total: number }>();

	// Group transactions by category
	transactions.forEach((txn) => {
		const category = txn.category;
		if (!categories.has(category)) {
			categories.set(category, { count: 0, total: 0 });
		}

		const amount =
			typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/[$,]/g, '')) : txn.amount;

		const entry = categories.get(category)!;
		entry.count++;
		entry.total += amount;
	});

	// Create category summary
	let breakdown = '**Transaction Summary:**\n';

	categories.forEach((data, category) => {
		breakdown += `- ${category}: ${data.count} transactions totaling $${data.total.toFixed(2)}\n`;
	});

	return breakdown;
}

/**
 * Smart chunking function that groups text into transaction records
 * based on patterns in banking/transaction data
 */
function smartChunkTransactionData(text: string): string[] {
	console.log('[smartChunk] Starting smart chunking...');
	// First, try to identify transaction record boundaries
	// Common patterns include: date headers, blank lines between records, consistent formatting

	// 1. Try splitting by blank lines (common in pasted bank statements)
	let initialChunks = text.split(/\n\s*\n+/);
	console.log(`[smartChunk] Initial split by blank lines resulted in ${initialChunks.length} chunks.`);
	// console.log('[smartChunk] Initial chunks (blank lines):', initialChunks); // Optional: Log all chunks if needed

	// If we got very few chunks but the text is long, it might use newlines to separate transactions
	if (initialChunks.length <= 5 && text.split('\n').length > BULK_DATA_THRESHOLD_LINES) {
		console.log('[smartChunk] Few chunks found, trying split by date pattern lines...');
		// Try to identify records by date patterns at the beginning of lines
		const lines = text.split('\n');
		const datePatternLines = lines.filter((line) =>
			/^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[0-1]?[0-9]\/[0-3]?[0-9]\/\d{2,4})/.test(
				line
			)
		);

		// If we found lots of lines starting with dates, they're likely transaction separators
		if (datePatternLines.length > 5) {
			console.log(`[smartChunk] Found ${datePatternLines.length} lines starting with dates. Re-chunking...`);
			// Build chunks based on date pattern lines as separators
			const dateBasedChunks: string[] = [];
			let currentChunk = '';

			for (const line of lines) {
				// If this line starts a new record, start a new chunk
				if (
					/^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[0-1]?[0-9]\/[0-3]?[0-9]\/\d{2,4})/.test(
						line
					)
				) {
					if (currentChunk.trim()) {
						dateBasedChunks.push(currentChunk.trim());
					}
					currentChunk = line;
				} else {
					currentChunk += '\n' + line;
				}
			}

			// Add the last chunk
			if (currentChunk.trim()) {
				dateBasedChunks.push(currentChunk.trim());
			}
			initialChunks = dateBasedChunks;
			console.log(`[smartChunk] Re-chunking by date resulted in ${initialChunks.length} chunks.`);
			// console.log('[smartChunk] Initial chunks (date-based):', initialChunks); // Optional: Log all chunks
		} else {
			console.log('[smartChunk] Not enough date pattern lines found to justify re-chunking.');
		}
	}

	// Filter out empty chunks and very short ones that are likely headers or footers
	console.log(`[smartChunk] Filtering ${initialChunks.length} chunks for metadata and length...`);
	const filteredChunks = initialChunks.filter((chunk, index) => {
		const trimmed = chunk.trim();
		const isMeta = isBankingMetadata(trimmed);
		const keep = trimmed.length > 10 && !isMeta;
		if (!keep) {
			console.log(`[smartChunk] Filtering out chunk ${index} (length: ${trimmed.length}, isMeta: ${isMeta}):\n--- START CHUNK ---\n${trimmed}\n--- END CHUNK ---`);
		}
		return keep;
	});
	console.log(`[smartChunk] After filtering: ${filteredChunks.length} chunks remain.`);
	// console.log('[smartChunk] Filtered chunks:', filteredChunks); // Optional: Log all chunks

	// Combine chunks that are likely to be part of the same transaction
	console.log(`[smartChunk] Merging ${filteredChunks.length} chunks based on transaction completeness...`);
	const mergedChunks: string[] = [];
	let currentChunk = '';

	for (let i = 0; i < filteredChunks.length; i++) {
		const chunk = filteredChunks[i];
		const isComplete = looksLikeCompleteTransaction(chunk);
		console.log(`[smartChunk] Checking chunk ${i} for completeness: ${isComplete}\n--- START CHUNK ---\n${chunk}\n--- END CHUNK ---`);

		// If the chunk doesn't look complete
		if (!isComplete) {
			// If we have a current chunk being built, add this one to it
			if (currentChunk) {
				console.log(`[smartChunk] Chunk ${i} looks incomplete, appending to previous chunk.`);
				currentChunk += '\n' + chunk;
			} else {
				// Otherwise, start a new current chunk
				console.log(`[smartChunk] Chunk ${i} looks incomplete, starting new potential merged chunk.`);
				currentChunk = chunk;
			}
		} else { // This chunk looks complete
			// If we were building an incomplete chunk, finish it now
			if (currentChunk) {
				console.log(`[smartChunk] Chunk ${i} looks complete. Finalizing previous incomplete chunk.`);
				mergedChunks.push(currentChunk);
				currentChunk = ''; // Reset for the next potential incomplete sequence
			}

			// Add this complete chunk as its own entry
			console.log(`[smartChunk] Adding complete chunk ${i} as a merged chunk.`);
			mergedChunks.push(chunk);
		}
	}

	// Add any remaining chunk that was being built
	if (currentChunk) {
		console.log('[smartChunk] Adding final remaining potentially incomplete chunk.');
		mergedChunks.push(currentChunk);
	}
	console.log(`[smartChunk] After merging: ${mergedChunks.length} chunks.`);
	// console.log('[smartChunk] Merged chunks:', mergedChunks); // Optional: Log all chunks

	// Now group our chunks into batches for more efficient API usage
	console.log(`[smartChunk] Batching ${mergedChunks.length} merged chunks...`);
	const BATCH_TARGET_SIZE = 2000; // Characters per batch, adjust based on your model
	const batches: string[] = [];
	let currentBatch = '';
	let currentBatchSize = 0;

	for (let i = 0; i < mergedChunks.length; i++) {
		const chunk = mergedChunks[i];
		// If adding this chunk would exceed our target batch size, start a new batch
		if (currentBatchSize > 0 && currentBatchSize + chunk.length > BATCH_TARGET_SIZE) {
			console.log(`[smartChunk] Finalizing batch ${batches.length + 1} (size: ${currentBatchSize}). Starting new batch with chunk ${i}.`);
			batches.push(currentBatch);
			currentBatch = chunk;
			currentBatchSize = chunk.length;
		} else {
			// Otherwise, add it to the current batch
			if (currentBatch) {
				console.log(`[smartChunk] Adding chunk ${i} to current batch ${batches.length + 1}.`);
				currentBatch += '\n\n' + chunk; // Add separator between merged chunks within a batch
			} else {
				console.log(`[smartChunk] Starting batch ${batches.length + 1} with chunk ${i}.`);
				currentBatch = chunk;
			}
			currentBatchSize += chunk.length;
		}
	}

	// Add the final batch
	if (currentBatch) {
		console.log(`[smartChunk] Finalizing last batch ${batches.length + 1} (size: ${currentBatchSize}).`);
		batches.push(currentBatch);
	}

	console.log(`[smartChunk] Finished batching. Total batches: ${batches.length}.`);
	// console.log('[smartChunk] Final batches:', batches); // Optional: Log final batches
	return batches;
}

/**
 * Helper to check if a text chunk looks like complete banking data
 * with amount, date and description patterns.
 * REVIEW: This heuristic might be too strict if the amount is the very last line
 * and the initial split separated it. The description check (`split('\n').length > 1`)
 * might fail for single-line descriptions if the amount was on the next line.
 */
function looksLikeCompleteTransaction(text: string): boolean {
	// Regex for common currency patterns (USD, EUR, GBP etc.) or just numbers with decimals/commas
	const hasAmount = /[£$€]?\s*[\d,]+(?:\.\d{1,2})?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|dollars?)/i.test(text);
	// Regex for common date formats
	const hasDate =
		/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?,? \d{2,4}\b|\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/.test(
			text
		);
	// Check for non-numeric, non-date text that likely represents a description.
	// Improved check: Look for lines that don't solely contain dates or amounts.
	const lines = text.trim().split('\n');
	const hasDescriptionLine = lines.some(line => {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0) return false; // Ignore empty lines
		const isOnlyDate = /^\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?,? \d{2,4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*$/i.test(trimmedLine);
		const isOnlyAmount = /^\s*[£$€]?\s*[\d,]+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|dollars?)?\s*$/i.test(trimmedLine);
		return !isOnlyDate && !isOnlyAmount;
	});

	// Original description check: const hasDescription = text.split('\n').length > 1;
	// Consider a transaction complete if it has an amount and a date.
	// The description check is less critical for *grouping* initially,
	// as the LLM can often figure out descriptions even from sparse data.
	// Let's make description optional for the completeness check during merging.
	// return hasAmount && hasDate && hasDescriptionLine;
	const isComplete = hasAmount && hasDate;
	// console.log(`[looksLikeCompleteTransaction] Text: "${text.substring(0, 50)}...", HasAmount: ${hasAmount}, HasDate: ${hasDate}, HasDescriptionLine: ${hasDescriptionLine}, IsComplete: ${isComplete}`);
	return isComplete;
}

/**
 * Helper to identify bank statement metadata (headers, footers, page numbers)
 * that should not be processed as transactions.
 * REVIEW: Ensure these patterns aren't accidentally matching transaction lines.
 * The `/^balance/i` could be problematic if a description starts with "Balance".
 */
function isBankingMetadata(text: string): boolean {
	// Common banking header/footer phrases
	const metadataPhrases = [
		/page \d+(?: of \d+)?/i, // Page number
		/statement period/i,
		/account summary/i,
		/^(?:beginning|starting) balance/i, // Anchor to start of line
		/^(?:ending|closing) balance/i,   // Anchor to start of line
		/account number:?.*?\*{4,}\d{4}/i, // Masked account number
		/transaction(?:s)? history/i,
		/available balance/i,
		/(?:total|subtotal)\s*(?:withdrawals?|debits?|payments?)/i,
		/(?:total|subtotal)\s*(?:deposits?|credits?)/i,
		/^\s*balance\s*$/i, // Line containing only the word "balance"
		/^\s*date\s+description\s+amount/i, // Common table header
		/^\s*posting date\s+transaction date/i, // Common table header variation
		/^\s*continued on next page/i,
		/^\s*end of statement/i,
	];

	const trimmedText = text.trim();
	// Also filter very short lines that are unlikely to be full transactions
	if (trimmedText.length < 8 && !/\d/.test(trimmedText)) { // e.g., "Fees", "Interest" might be short but valid if part of a larger chunk
		// console.log(`[isBankingMetadata] Filtering short non-numeric line: "${trimmedText}"`);
		// return true; // Be cautious with this, might filter valid short descriptions
	}

	const isMeta = metadataPhrases.some((regex) => regex.test(trimmedText));
	// if (isMeta) {
	// 	console.log(`[isBankingMetadata] Matched metadata pattern in: "${trimmedText.substring(0, 100)}..."`);
	// }
	return isMeta;
}


/**
 * Deduplicate transactions based on date, amount, and description
 */
function deduplicateTransactions(transactions: Transaction[]): Transaction[] {
	const seen = new Set();
	return transactions.filter((txn) => {
		// Normalize description slightly for better matching (lowercase, remove extra spaces)
		const normalizedDescription = (txn.description || '').toLowerCase().replace(/\s+/g, ' ').trim();
		// Create a unique key for each transaction
		const key = `${txn.date}-${txn.amount}-${normalizedDescription}`;
		if (seen.has(key)) {
			// console.log(`[deduplicate] Duplicate found: ${key}`);
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * Enhanced bulk data processing using smart chunking and batching
 * NOTE: This function seems redundant with startBackgroundProcessing.
 * Consider consolidating the core processing logic.
 */
export async function processBulkData(
	message: string
): Promise<{ handled: boolean; response: string }> {
	console.warn("[processBulkData] This function might be redundant. Consider using startBackgroundProcessing.");
	if (!isBulkData(message)) {
		return { handled: false, response: '' };
	}

	console.log('[processBulkData] Large input detected, attempting smart chunk processing...');
	conversationStatus.set('Processing bulk data (0%)...');
	conversationProgress.set(0); // Ensure progress starts at 0

	// Use our smart chunking algorithm
	const smartChunks = smartChunkTransactionData(message);

	const totalChunks = smartChunks.length;
	if (totalChunks === 0) {
		conversationStatus.set('');
		conversationProgress.set(0);
		return { handled: true, response: 'No processable transaction data found in your input.' };
	}

	// Process our optimized chunks
	let processedChunks = 0;
	const allExtractedTxns: Transaction[] = [];
	let processingErrorOccurred = false;

	console.log(`[processBulkData] Starting processing of ${totalChunks} smart chunks.`);
	for (let i = 0; i < totalChunks; i++) {
		const chunk = smartChunks[i];
		console.log(
			`[processBulkData] Processing chunk ${i + 1}/${totalChunks} (${chunk.length} characters)...`
		);

		try {
			// Optional: Log chunk content before sending to extraction
			// console.log(`[processBulkData] Chunk ${i + 1} content:\n--- START CHUNK ---\n${chunk}\n--- END CHUNK ---`);
			const chunkResult = await extractTransactionsFromText(chunk);
			if (chunkResult && chunkResult.length > 0) {
				allExtractedTxns.push(...chunkResult);
				console.log(
					`[processBulkData] Extracted ${chunkResult.length} transactions from chunk ${i + 1}`
				);
			} else {
				console.log(`[processBulkData] No transactions extracted from chunk ${i + 1}`);
			}
		} catch (error) {
			console.error(`[processBulkData] Error processing chunk ${i + 1}/${totalChunks}:`, error);
			processingErrorOccurred = true;
			// Optional: Decide whether to stop processing or continue with next chunk
			// break; // Uncomment to stop on first error
		}

		processedChunks++;
		const progressPercent = Math.round((processedChunks / totalChunks) * 100);
		conversationProgress.set(progressPercent);
		conversationStatus.set(
			`Processing bulk data (${progressPercent}% - ${processedChunks}/${totalChunks})...`
		);

		// Add a small delay to allow UI updates and prevent blocking the event loop entirely
		await new Promise(resolve => setTimeout(resolve, 10));
	}

	console.log(`[processBulkData] Finished processing ${totalChunks} chunks.`);

	// Deduplicate transactions before adding them
	const uniqueTransactions = deduplicateTransactions(allExtractedTxns);
	console.log(
		`[processBulkData] Deduplicated from ${allExtractedTxns.length} to ${uniqueTransactions.length} transactions`
	);

	let response = '';
	if (uniqueTransactions.length > 0) {
		extractedTransactions.update((txns) => [...txns, ...uniqueTransactions]);
		const categoryBreakdown = getCategoryBreakdown(uniqueTransactions);
		response = `Finished processing! I found ${uniqueTransactions.length} unique transactions.\n\n` +
				   `${categoryBreakdown}\n\n`;
		if (processingErrorOccurred) {
			response += 'Note: Some parts of your data may have caused errors during processing.\n\n';
		}
		response += `You can now see all transactions in the panel on the right. Would you like me to help you analyze this data?`;
	} else {
		response = `I processed your data but couldn't extract any valid transactions.`;
		if (processingErrorOccurred) {
			response += ' There were some errors during processing.';
		}
		response += ' Please check your data format or try a different section.';
	}

	// Reset progress indicators
	conversationProgress.set(0);
	conversationStatus.set('');
	setState({ initialPromptSent: true }); // Assuming this state indicates processing is done

	// Add the final summary message to the conversation
	safeAddAssistantMessage(response);

	// The function signature requires returning a response string, but in this async flow,
	// the response is added via safeAddAssistantMessage. Return an empty string or confirmation.
	return { handled: true, response: "Processing complete. See conversation history for results." };
}
