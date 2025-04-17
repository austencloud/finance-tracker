export function formatCurrency(amount: number | null | undefined): string {
	const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	}).format(val);
}
