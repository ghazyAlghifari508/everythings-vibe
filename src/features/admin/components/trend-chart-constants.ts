export const RANGE_OPTIONS = [
	{ days: 7, label: "7 Hari" },
	{ days: 14, label: "14 Hari" },
	{ days: 30, label: "30 Hari" },
] as const;

export const SVG_WIDTH = 1000;
export const SVG_HEIGHT = 340;
export const PADDING_LEFT = 75;
export const PADDING_RIGHT = 45;
export const PADDING_TOP = 30;
export const PADDING_BOTTOM = 40;

export function formatCompactCurrency(amount: number): string {
	if (amount === 0) return "Rp 0";
	if (amount >= 1_000_000) {
		const val = amount / 1_000_000;
		return `Rp ${Number.isInteger(val) ? val : val.toFixed(1)}jt`;
	}
	if (amount >= 1_000) {
		const val = amount / 1_000;
		return `Rp ${Number.isInteger(val) ? val : val.toFixed(1)}k`;
	}
	return `Rp ${amount}`;
}
