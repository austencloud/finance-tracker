// src/lib/services/exporter.ts
import type { Transaction, Category, CategoryTotals } from '$lib/stores/types'; // Corrected type import path
import { downloadFile } from '$lib/utils/helpers';

/**
 * Exports transactions as JSON file
 */
export function exportAsJson(transactions: Transaction[]): void {
	const dataStr = JSON.stringify(transactions, null, 2);
	downloadFile(dataStr, 'transactions.json', 'application/json;charset=utf-8');
}

/**
 * Generates and downloads an HTML report of transactions
 */
export function generateHTMLReport(
	transactions: Transaction[],
	categoryTotals: CategoryTotals,
	categoriesList: Category[] // <-- ADD categoriesList argument
): void {
	let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Transaction Report</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
        h1 { color: #2c3e50; text-align: center; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #2980b9; margin-top: 30px; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background-color: #f2f6f9; text-align: left; padding: 10px; border-bottom: 2px solid #ddd; }
        td { padding: 8px 10px; border-bottom: 1px solid #ddd; }
        .amount { text-align: right; }
        .credit { color: #27ae60; }
        .debit { color: #e74c3c; }
        .total { font-weight: bold; text-align: right; padding: 10px; background-color: #eaf2f8; }
        @media print {
          body { padding: 0; }
          table { page-break-inside: avoid; }
          h2 { page-break-before: always; }
          h2:first-of-type { page-break-before: avoid; }
        }
      </style>
    </head>
    <body>
      <h1>Transaction Report</h1>
      
      <h2>Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th class="amount">Total</th>
          </tr>
        </thead>
        <tbody>
  `;

	// Add summary rows (using provided categoryTotals)
	let grandTotal = 0;
	// Ensure we only iterate categories present in the totals
	for (const category of categoriesList) {
		const total = categoryTotals[category] || 0; // Default to 0 if category missing in totals
		if (total !== 0 || category === 'Expenses') {
			// Optionally show Expenses even if 0
			const isExpense = category === 'Expenses';
			grandTotal += total;
			html += `
            <tr>
              <td>${category}</td>
              <td class="amount ${isExpense ? 'debit' : 'credit'}">$${Math.abs(total).toFixed(2)}</td>
            </tr>
          `;
		}
	}

	html += `
      <tr>
        <td class="total">Grand Total</td>
        <td class="amount total ${grandTotal >= 0 ? 'credit' : 'debit'}">$${grandTotal.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  `;

	// Create a section for each category (using the passed-in categoriesList)
	// Use the passed categoriesList for the loop
	for (const category of categoriesList) {
		const categoryTransactions = transactions.filter((t) => t.category === category);

		if (categoryTransactions.length > 0) {
			html += `
        <h2>${category}</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Type</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
      `;

			let categorySectionTotal = 0;
			for (const txn of categoryTransactions) {
				// Amount is already number
				const amount = txn.amount;
				const isExpense = txn.direction === 'out'; // Use direction
				categorySectionTotal += isExpense ? -Math.abs(amount) : Math.abs(amount);

				html += `
          <tr>
            <td>${txn.date}</td>
            <td>${txn.description}</td>
            <td>${txn.type}</td>
            <td class="amount ${isExpense ? 'debit' : 'credit'}">$${Math.abs(amount).toFixed(2)}</td>
          </tr>
        `;
			}

			html += `
          <tr>
            <td colspan="3" class="total">Category Total:</td>
            <td class="amount total ${categorySectionTotal >= 0 ? 'credit' : 'debit'}">$${Math.abs(categorySectionTotal).toFixed(2)}</td>
          </tr>
          </tbody>
        </table>
      `;
		}
	}

	html += `
      <footer style="margin-top: 30px; text-align: center; font-size: 12px; color: #777;">
        <p>Generated on ${new Date().toLocaleDateString()} | For tax and financial planning purposes</p>
      </footer>
    </body>
    </html>
  `;

	// Download the HTML file
	downloadFile(html, 'transaction-report.html', 'text/html;charset=utf-8');
}
