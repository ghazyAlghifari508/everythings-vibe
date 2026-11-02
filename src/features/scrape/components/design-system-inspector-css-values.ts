// Specimen copy is chosen per typography role in design-normalize-typography, so
// no captured page text reaches the UI.
export function isCssLength(value: string): boolean {
	return /^[\d.]+(px|rem|em|%)$/.test(value.trim());
}

export function isSafeFontFamily(value: string): boolean {
	return /^[\w\s,'"-]+$/.test(value.trim());
}

export function isSafeLineHeight(value: string): boolean {
	const normalized = value.trim();
	return /^[\d.]+$/.test(normalized) || isCssLength(normalized);
}
