// src/lib/services/categorizer.ts

import type { Category } from "$lib/stores/types";


/**
 * Categorizes a transaction based on its description and type
 */
export function categorizeTransaction(description: string, type: string): Category {
	// Default category if nothing matches
	let category: Category = 'Other / Uncategorized';

	if (description.includes('PAYPAL TRANSFER')) {
		category = 'PayPal Transfers';
	} else if (description.includes('Coinbase') || description.includes('COINBASE')) {
		category = 'Crypto Sales';
	} else if (
		description.includes('KAREN M BURRIS') ||
		description.includes('FULL MOON JAM FOUNDATION') ||
		description.includes('PYROTECHNIQ, INC.') ||
		description.includes('ROBERT G BERSHADSKY') ||
		description.includes('SPARKLES ENTERTA Payroll') ||
		description.includes('KEATON FISHER')
	) {
		category = 'Business Income - Austen Cloud Performance';
	} else if (description.includes('Open Research') || description.includes('YC RESEARCH')) {
		category = 'Non-Taxable Research/Surveys';
	} else if (description.includes('THE INSECT ASYLUM INC.')) {
		category = 'Misc Work - Insect Asylum';
	} else if (
		description.includes('REMOTE ONLINE DEPOSIT') ||
		description.includes('ATM CASH DEPOSIT')
	) {
		category = 'Remote Deposits';
	} else if (description.includes('CHRISTINA A VALDES')) {
		category = 'Rent Payments Received (Non-Income)';
	} else if (type === 'Card' || description.includes('Cash Redemption')) {
		category = 'Expenses';
	}

	return category;
}
