// src/lib/utils/helpers.ts

/**
 * Generate a unique ID for a transaction
 * @returns A unique number ID
 */
export function generateTransactionId(): number {
	// Combine timestamp with random number for better uniqueness chance
	return Date.now() + Math.floor(Math.random() * 10000);
  }
  
  /**
   * Creates a downloader for any type of file
   * @param data The file data
   * @param filename The filename to use
   * @param mimeType The MIME type of the file
   */
  export function downloadFile(data: string, filename: string, mimeType: string): void {
	const blob = new Blob([data], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
  
	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.display = 'none';
  
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
  
	// Clean up the URL object
	setTimeout(() => URL.revokeObjectURL(url), 100);
  }
  
  /**
   * Basic heuristic check if a string looks like it might contain transaction data.
   * @param text - The input string.
   * @returns True if the text might contain transaction data, false otherwise.
   */
  export function textLooksLikeTransaction(text: string): boolean {
	const lowerText = text.toLowerCase();
	// Look for currency symbols OR numbers
	const hasAmount =
	  /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd|cad|eur|gbp)/i.test(
		lowerText
	  ) || /\b\d+\b/.test(lowerText);
	// Look for action keywords
	const hasKeyword =
	  /\b(spent|paid|bought|sold|received|deposit|income|expense|cost|got|transfer|sent|charge|fee|payment|salary|invoice|refund)\b/i.test(
		lowerText
	  );
	// Look for date-related keywords/formats
	const hasDate =
	  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}|\b(yesterday|today|last week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
		lowerText
	  );
  
	// Require an amount OR (a keyword AND a date) for it to look plausible
	return hasAmount || (hasKeyword && hasDate);
  }