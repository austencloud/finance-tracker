// src/lib/services/parser.ts
import type { Transaction, Category } from '$lib/types';
import { generateTransactionId } from '$lib/utils/helpers';
import { categorizeTransaction } from './categorizer';

/**
 * Parses raw transaction text into structured transaction objects
 */
export function parseTransactionData(text: string): Transaction[] {
  // Split the text into blocks
  const blocks = text.split(/\n\s*\n+/);
  const parsedTransactions: Transaction[] = [];

  for (let block of blocks) {
    if (!block.trim()) continue;

    const lines = block.trim().split('\n');

    // Extract date - look for a date format in the first or second line
    let date = '';
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const dateLine = lines[i].trim();
      // Check for common date formats (MM/DD/YYYY or Month DD, YYYY)
      if (
        /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateLine) ||
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i.test(dateLine)
      ) {
        date = dateLine;
        break;
      }
    }

    // Extract description - try to find the most descriptive line
    let description = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line &&
        !line.includes('$') &&
        !/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i.test(line) &&
        !/\d{1,2}\/\d{1,2}\/\d{4}/.test(line) &&
        !/^(ACH credit|Zelle credit|Card|Deposit|ATM transaction|Other)$/.test(line)
      ) {
        description = line;
        // If we find a line with more than just a few words, use it as the description
        if (line.split(/\s+/).length > 3) {
          break;
        }
      }
    }

    // Extract transaction type
    let type = '';
    for (let line of lines) {
      if (/^(ACH credit|Zelle credit|Card|Deposit|ATM transaction|Other)$/.test(line.trim())) {
        type = line.trim();
        break;
      }
    }

    // Extract amount
    let amount = '0';
    for (let line of lines) {
      const match = line.match(/\$[\d,]+\.\d{2}/);
      if (match) {
        amount = match[0].replace(/[,$]/g, '');
        break;
      }
    }

    // Add the transaction if we have meaningful data
    if ((date || description) && amount !== '0') {
      const category = categorizeTransaction(description, type);

      parsedTransactions.push({
        id: generateTransactionId(),
        date,
        description,
        type,
        amount,
        category,
        notes: '',
        direction: type.includes('credit') ? 'in' : 'out'
      });
    }
  }

  return parsedTransactions;
}

/**
 * Returns sample transaction data for testing
 */
export function getSampleData(): string {
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