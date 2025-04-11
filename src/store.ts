// src/store.ts
import { writable, derived } from 'svelte/store';
import type { Transaction, Category, CategoryTotals, FilterCategory, SortField, SortDirection } from './types';

// Define initial categories
export const categories: Category[] = [
  "PayPal Transfers",
  "Business Income - Austen Cloud Performance",
  "Crypto Sales",
  "Non-Taxable Research/Surveys",
  "Misc Work - Insect Asylum",
  "Remote Deposits",
  "Rent Payments Received (Non-Income)",
  "Expenses",
  "Other / Uncategorized"
];

// Main transaction store
export const transactions = writable<Transaction[]>([]);

// UI state stores
export const loading = writable(false);
export const showSuccessMessage = writable(false);
export const selectedTransaction = writable<Transaction | null>(null);
export const showTransactionDetails = writable(false);
export const currentCategory = writable<Category>(categories[0]);

// Filter and sort state
export const filterCategory = writable<FilterCategory>('all');
export const searchTerm = writable('');
export const sortField = writable<SortField>('date');
export const sortDirection = writable<SortDirection>('desc');

// Calculate category totals based on transactions
export const categoryTotals = derived(transactions, $transactions => {
  const totals: CategoryTotals = {};
  
  // Initialize all categories with zero
  categories.forEach(cat => {
    totals[cat] = 0;
  });
  
  // Sum up amounts for each category
  $transactions.forEach(txn => {
    if (txn.category) {
      // Convert amount to number, removing $ and commas
      const amount = parseFloat(txn.amount.toString().replace(/[$,]/g, '')) || 0;
      
      // For expenses, store as negative
      const adjustedAmount = txn.category === "Expenses" ? -Math.abs(amount) : Math.abs(amount);
      
      totals[txn.category] += adjustedAmount;
    }
  });
  
  return totals;
});

// Filter transactions based on category and search term
export const filteredTransactions = derived(
  [transactions, filterCategory, searchTerm],
  ([$transactions, $filterCategory, $searchTerm]) => {
    return $transactions.filter(txn => {
      // Category filter
      const categoryMatch = $filterCategory === 'all' || txn.category === $filterCategory;
      
      // Search filter
      const searchMatch = $searchTerm === '' || 
        txn.description.toLowerCase().includes($searchTerm.toLowerCase()) ||
        txn.date.toLowerCase().includes($searchTerm.toLowerCase());
      
      return categoryMatch && searchMatch;
    });
  }
);

// Sort filtered transactions
export const sortedTransactions = derived(
  [filteredTransactions, sortField, sortDirection],
  ([$filteredTransactions, $sortField, $sortDirection]) => {
    return [...$filteredTransactions].sort((a, b) => {
      let valueA: any, valueB: any;
      
      if ($sortField === 'amount') {
        valueA = parseFloat(a.amount.toString().replace(/[$,]/g, ''));
        valueB = parseFloat(b.amount.toString().replace(/[$,]/g, ''));
      } else if ($sortField === 'date') {
        // Try to parse dates in various formats
        try {
          valueA = new Date(a.date);
          valueB = new Date(b.date);
          
          // If the date is invalid, fall back to string comparison
          if (isNaN(valueA.getTime()) || isNaN(valueB.getTime())) {
            valueA = a.date;
            valueB = b.date;
          }
        } catch (e) {
          valueA = a.date;
          valueB = b.date;
        }
      } else {
        valueA = a[$sortField];
        valueB = b[$sortField];
      }
      
      // Compare the values
      if (valueA < valueB) return $sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return $sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }
);

// Actions for transactions
export function addTransactions(newTransactions: Transaction[]): void {
  transactions.update(txns => [...txns, ...newTransactions]);
  showTemporaryMessage();
}

export function clearTransactions(): void {
  if (confirm('Are you sure you want to clear all transactions? This cannot be undone.')) {
    transactions.set([]);
  }
}

export function deleteTransaction(id: number): void {
  transactions.update(txns => txns.filter(t => t.id !== id));
}

export function updateTransaction(updatedTransaction: Transaction): void {
  transactions.update(txns => {
    const index = txns.findIndex(t => t.id === updatedTransaction.id);
    if (index !== -1) {
      txns[index] = updatedTransaction;
    }
    return [...txns]; // Create new array to trigger reactivity
  });
}

export function assignCategory(transaction: Transaction, category: Category): void {
  transactions.update(txns => {
    const index = txns.findIndex(t => t.id === transaction.id);
    if (index !== -1) {
      txns[index].category = category;
    }
    return [...txns]; // Create new array to trigger reactivity
  });
}

export function addNotes(transaction: Transaction, notes: string): void {
  transactions.update(txns => {
    const index = txns.findIndex(t => t.id === transaction.id);
    if (index !== -1) {
      txns[index].notes = notes;
    }
    return [...txns]; // Create new array to trigger reactivity
  });
}

// Show temporary success message
function showTemporaryMessage(): void {
  showSuccessMessage.set(true);
  setTimeout(() => showSuccessMessage.set(false), 3000);
}

// Toggle sort direction
export function toggleSort(field: SortField): void {
  sortField.update(currentField => {
    if (currentField === field) {
      sortDirection.update(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      sortDirection.set('asc');
    }
    return field;
  });
}