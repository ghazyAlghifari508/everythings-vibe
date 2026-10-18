// A specimen sentence only stands in for text the capture did not record; when a
// real sample exists it is used instead.
export const FALLBACK_SAMPLE = "The quick brown fox jumps over the lazy dog";

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
