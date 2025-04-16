// src/lib/services/parser.ts
import type { Category, Transaction } from '$lib/stores/types';
// REMOVE unused helper: import { generateTransactionId } from '$lib/utils/helpers';
import { v4 as uuidv4 } from 'uuid'; // Import UUID
import { categorizeTransaction } from './categorizer';
import { resolveAndFormatDate } from '$lib/utils/date'; // Import date helper

/**
 * Parses raw transaction text into structured transaction objects.
 * NOTE: This is a simpler parser, consider using enhancedLocalExtraction from
 * 'src/lib/services/ai/extraction/local-extractors.ts' for more robust local parsing.
 *
 * @param text The text to parse.
 * @param batchId A unique identifier for this parsing operation. // <-- Added parameter
 * @returns An array of parsed Transaction objects.
 */
export function parseTransactionData(text: string, batchId: string): Transaction[] { // <-- Added parameter
    // Split the text into blocks based on one or more blank lines
    const blocks = text.split(/\n\s*\n+/);
    const parsedTransactions: Transaction[] = [];

    for (let block of blocks) {
        if (!block.trim()) continue;

        const lines = block.trim().split('\n').map(line => line.trim()); // Trim each line

        // Extract date - look for a date format in the first few lines
        let dateStr = '';
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const dateLine = lines[i];
            // More robust date check
            if (
                /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateLine) || // MM/DD/YYYY or MM/DD/YY
                /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/i.test(dateLine) // Month DD, YYYY
            ) {
                dateStr = dateLine;
                break;
            }
        }
        // Resolve the found date string
        const date = resolveAndFormatDate(dateStr); // Use helper, defaults to 'unknown'

        // Extract amount - find line starting with $
        let amountStr = '0';
        let amountLineIndex = -1; // Track where amount was found
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match lines that primarily contain a currency amount
            const match = line.match(/^\$?[\s\d,]*\d\.\d{2}$/); // Allow optional space/commas before/after $
            if (match) {
                // More robust cleaning: remove $, commas, and any leading/trailing whitespace
                amountStr = line.replace(/[$,\s]/g, '');
                amountLineIndex = i;
                break;
            }
        }
        // --- Convert amount string to number ---
        const amount = parseFloat(amountStr) || 0; // Use parseFloat, fallback to 0 if NaN

        // Extract description & type - process lines *not* used for date or amount
        let description = '';
        let type = '';
        const potentialDescLines: string[] = [];
        const potentialTypeLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            // Skip the line if it was identified as the date or amount line
            if (lines[i] === dateStr || i === amountLineIndex) {
                continue;
            }
            const line = lines[i];
            // Basic type detection (can be improved)
            if (/credit|deposit|payment from/i.test(line)) {
                potentialTypeLines.push(line);
            } else if (/debit|payment to|purchase|withdrawal|charge|card/i.test(line)) {
                 potentialTypeLines.push(line);
            } else if (line) { // Any other non-empty line is a potential description part
                potentialDescLines.push(line);
            }
        }
        // Consolidate description and type
        description = potentialDescLines.join(' ').trim() || 'Unknown Description'; // Join potential lines
        type = potentialTypeLines.join(' ').trim() || 'Unknown Type'; // Join potential type lines


        // Basic direction inference
        const lowerTypeDesc = (description + ' ' + type).toLowerCase();
        let direction: 'in' | 'out' | 'unknown' = 'unknown';
         if (lowerTypeDesc.includes('credit') || lowerTypeDesc.includes('deposit') || lowerTypeDesc.includes('payment from')) {
             direction = 'in';
         } else if (lowerTypeDesc.includes('debit') || lowerTypeDesc.includes('payment to') || lowerTypeDesc.includes('purchase') || lowerTypeDesc.includes('withdrawal') || lowerTypeDesc.includes('charge') || lowerTypeDesc.includes('card')) {
             direction = 'out';
         }

        // Add the transaction if we have at least an amount
        if (amount > 0) {
            const category = categorizeTransaction(description, type);

            // Adjust category based on direction
            const finalCategory = (direction === 'out' && category === 'Other / Uncategorized') ? 'Expenses' :
                                 (direction === 'in' && category === 'Expenses') ? 'Other / Uncategorized' : category;

            // Ensure object matches Transaction type
            const transaction: Transaction = {
                id: uuidv4(), // Use UUID for string ID
                batchId: batchId, // Assign passed batchId
                date,
                description,
                type,
                amount, // Assign the parsed number
                category: finalCategory,
                notes: '',
                direction
            };
            parsedTransactions.push(transaction);
        }
    }

    return parsedTransactions;
}


/**
 * Returns sample transaction data for testing
 */
export function getSampleData(): string {
    // ... (sample data remains the same) ...
    return `
Dec 20, 2024

PAYPAL TRANSFER PPD ID: PAYPALSD11

PAYPAL TRANSFER PPD ID: PAYPALSD11

ACH credit

$599.52



Dec 16, 2024

PAYPAL TRANSFER PPD ID: PAYPALSD11

PAYPAL TRANSFER PPD ID: PAYPALSD11

ACH credit

$709.75



12/16/2024

Zelle payment from KAREN M BURRIS 23076746534

Zelle payment from KAREN M BURRIS 23076746534

Zelle credit

$450.00

12/16/2024

Zelle payment from FULL MOON JAM FOUNDATION 23075032271

Zelle payment from FULL MOON JAM FOUNDATION 23075032271

Zelle credit

$150.00

12/16/2024

Zelle payment from PYROTECHNIQ, INC. 23075895513

Zelle payment from PYROTECHNIQ, INC. 23075895513

Zelle credit

$50.00

Dec 10, 2024

Zelle payment from ROBERT G BERSHADSKY 23004636360

Zelle payment from ROBERT G BERSHADSKY 23004636360

Zelle credit

$920.00

12/10/2024

Zelle payment from PYROTECHNIQ, INC. 23004904731

Zelle payment from PYROTECHNIQ, INC. 23004904731

Zelle credit

$300.00

Dec 09, 2024

Zelle payment from PYROTECHNIQ, INC. 22996265672

Zelle payment from PYROTECHNIQ, INC. 22996265672

Zelle credit

$450.00

12/09/2024

Zelle payment from THE INSECT ASYLUM INC. 22982300201

Zelle payment from THE INSECT ASYLUM INC. 22982300201

Zelle credit

$60.00

Dec 02, 2024

COINBASE INC. 8889087930 PPD ID: 1327000623

COINBASE INC. 8889087930 PPD ID: 1327000623

ACH credit

$987.08



12/02/2024

Zelle payment from ANNA W WIERCIAK USBxCM1jQKDE

Zelle payment from ANNA W WIERCIAK USBxCM1jQKDE

Zelle credit

$50.00

Nov 29, 2024

Zelle payment from THE INSECT ASYLUM INC. 22869626437

Zelle payment from THE INSECT ASYLUM INC. 22869626437

Zelle credit

$341.66

Nov 27, 2024

Zelle payment from ADAM MOLSKI BACggr4qkzps

Zelle payment from ADAM MOLSKI BACggr4qkzps

Zelle credit

$60.00

Nov 21, 2024

Zelle payment from TATIANA IGYARTO 22789003085

Zelle payment from TATIANA IGYARTO 22789003085

Zelle credit

$67.00

Nov 04, 2024

PAYPAL TRANSFER PPD ID: PAYPALSD11

PAYPAL TRANSFER PPD ID: PAYPALSD11

ACH credit

$900.00
`;
}