// src/utils/exporters.ts
import type { Transaction, Category, CategoryTotals } from '../types';
import { categories } from '../store';

/**
 * Exports transactions as JSON file
 */
export function exportAsJson(transactions: Transaction[]): void {
	const dataStr = JSON.stringify(transactions, null, 2);
	const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;

	const exportFileDefaultName = 'transactions.json';

	const linkElement = document.createElement('a');
	linkElement.setAttribute('href', dataUri);
	linkElement.setAttribute('download', exportFileDefaultName);
	linkElement.click();
}

/**
 * Generates and downloads an HTML report of transactions
 */
export function generateHTMLReport(
	transactions: Transaction[],
	categoryTotals: CategoryTotals
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
      
      <!-- Summary -->
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

	// Add summary rows
	let grandTotal = 0;
	for (const [category, total] of Object.entries(categoryTotals)) {
		const isExpense = category === 'Expenses';
		grandTotal += total;

		html += `
      <tr>
        <td>${category}</td>
        <td class="amount ${isExpense ? 'debit' : 'credit'}">$${Math.abs(total).toFixed(2)}</td>
      </tr>
    `;
	}

	html += `
      <tr>
        <td class="total">Grand Total</td>
        <td class="amount total ${grandTotal >= 0 ? 'credit' : 'debit'}">$${Math.abs(grandTotal).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  `;

	// Create a section for each category
	for (const category of categories) {
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

			for (const txn of categoryTransactions) {
				const amount = parseFloat(txn.amount.toString().replace(/[$,]/g, ''));
				const isExpense = category === 'Expenses';

				html += `
          <tr>
            <td>${txn.date}</td>
            <td>${txn.description}</td>
            <td>${txn.type}</td>
            <td class="amount ${isExpense ? 'debit' : 'credit'}">$${amount.toFixed(2)}</td>
          </tr>
        `;
			}

			html += `
          <tr>
            <td colspan="3" class="total">Category Total:</td>
            <td class="amount total ${categoryTotals[category as Category] >= 0 ? 'credit' : 'debit'}">$${Math.abs(categoryTotals[category as Category]).toFixed(2)}</td>
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

	// Create a data URI and download the HTML file
	const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

	const linkElement = document.createElement('a');
	linkElement.setAttribute('href', dataUri);
	linkElement.setAttribute('download', 'transaction-report.html');
	linkElement.click();
}
