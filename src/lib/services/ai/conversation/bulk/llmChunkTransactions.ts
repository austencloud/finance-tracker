// src/lib/services/ai/conversation/bulk/llmChunkTransactions.ts

/**
 * A simple sentence-splitting utility to break a block of text into individual sentences.
 * Falls back to newline splitting if no punctuation-based sentences are found.
 */
function splitSentences(text: string): string[] {
	// Match sequences ending in ., !, or ? including the delimiter
	const sentenceRegex = /[^.!?]+[.!?]+/g;
	const matches = text.match(sentenceRegex);
	if (matches && matches.length > 0) {
	  return matches.map((s) => s.trim());
	}
	// If no punctuation-based sentences, split on newlines
	return text
	  .split(/\n+/)
	  .map((s) => s.trim())
	  .filter((s) => s.length > 0);
  }
  
  /**
   * Chunks a raw input text into logical segments, each containing one or more sentences,
   * ensuring that no chunk exceeds a target character length for downstream LLM calls.
   *
   * @param text The raw user input potentially containing many transactions.
   * @param maxLength Optional max length per chunk (default: 500 characters).
   * @returns Array of text chunks suitable for individual processing.
   */
  export async function llmChunkTransactions(
	text: string,
	maxLength = 500
  ): Promise<string[]> {
	if (!text || !text.trim()) {
	  return [];
	}
  
	const sentences = splitSentences(text);
	const chunks: string[] = [];
	let current = '';
  
	for (const sentence of sentences) {
	  // If adding this sentence would exceed maxLength, flush the current chunk
	  if (current && (current.length + sentence.length + 1 > maxLength)) {
		chunks.push(current.trim());
		current = sentence;
	  } else {
		// Otherwise, append it to the current chunk
		current = current ? `${current} ${sentence}` : sentence;
	  }
	}
  
	// Push any remaining text
	if (current) {
	  chunks.push(current.trim());
	}
  
	return chunks;
  }
  