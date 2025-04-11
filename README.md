# Transaction Categorizer

A modern, TypeScript-based web application built with SvelteKit for categorizing and analyzing financial transactions.

## Features

- **Automated Transaction Parsing**: Easily parse and process transaction data from various banking formats
- **Intelligent Categorization**: Automatically categorize transactions based on patterns and descriptions
- **Interactive Interface**: Sort, filter, and search transactions with ease
- **Data Visualization**: View category totals and overall financial summaries
- **Report Generation**: Export formatted HTML reports for printing or sharing
- **Persistent Storage**: Save and load transaction data using JSON export/import
- **Responsive Design**: Works on desktop and mobile devices

## Screenshots

![Transaction Categorizer Main Screen](https://via.placeholder.com/800x450.png?text=Transaction+Categorizer)

## Getting Started

### Prerequisites

- Node.js (v16 or newer)
- npm or yarn

### Installation

1. Clone the repository

   ```bash
   git clone https://github.com/yourusername/transaction-categorizer.git
   cd transaction-categorizer
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Start the development server
   ```bash
   npm run dev -- --open
   ```

## Usage

### Entering Data

The application accepts transaction data in plain text format, typically as exported from your banking or financial institution. You can:

1. Paste data directly into the input area
2. Import previously exported JSON data
3. Use the sample data for testing

### Categorizing Transactions

Transactions are automatically categorized based on rules defined in the application. You can:

- Manually change categories using the dropdown in each row
- Add notes to transactions for future reference
- Filter and search to find specific transactions

### Generating Reports

After organizing your transactions, you can:

- View summary totals by category
- Generate a formatted HTML report for printing
- Export your data as JSON for future reference

## Customizing

### Transaction Categories

The default categories are:

- PayPal Transfers
- Business Income - Austen Cloud Performance
- Crypto Sales
- Non-Taxable Research/Surveys
- Misc Work - Insect Asylum
- Remote Deposits
- Rent Payments Received (Non-Income)
- Expenses
- Other / Uncategorized

To customize these categories:

1. Edit the `categories` array in `src/store.ts`
2. Update the `Category` type in `src/types.ts`
3. Modify the categorization logic in `src/utils/categorizer.ts`

### Transaction Parsing

If your financial institution provides data in a different format, you may need to adjust the parsing logic in `src/utils/parser.ts` to correctly extract transaction details.

## Development

### Project Structure

```
src/
├── components/              # UI Components
│   ├── CategoryTotals.svelte
│   ├── Filters.svelte
│   ├── InputForm.svelte
│   ├── TransactionModal.svelte
│   └── TransactionsTable.svelte
├── utils/                   # Utility functions
│   ├── categorizer.ts       # Transaction categorization logic
│   ├── exporters.ts         # Export functionality
│   ├── helpers.ts           # Helper functions
│   └── parser.ts            # Transaction parsing logic
├── App.svelte               # Main application component
├── main.ts                  # Application entry point
├── store.ts                 # Svelte store for state management
└── types.ts                 # TypeScript type definitions
```

### Building for Production

To create a production build:

```bash
npm run build
```

To preview the production build:

```bash
npm run preview
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [SvelteKit](https://kit.svelte.dev/)
- Styled with CSS
- Developed for personal financial organization and tax preparation

---

Made with ❤️ to simplify financial organization
