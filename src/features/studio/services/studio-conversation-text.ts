import type { StudioFrameFacts } from "../types/studio-conversation";

/**
 * Model-, user- and HTML-authored text is placed inline in Markdown, so strip
 * everything that could restructure it, open a link or hide characters.
 * Rendering also drops raw HTML; this keeps the stored content itself inert.
 */
export function plain(value: string, limit?: number): string {
	const text = value
		.replace(/\p{Cc}|\p{Cf}/gu, " ")
		.replace(/\b(?:https?|ftp):\/\/\S*/gi, "")
		.replace(/\bwww\.\S*/gi, "")
		.replace(/[*_`<>[\]\\~@]/g, "")
		.replace(/\|/g, "/")
		.replace(/\s+/g, " ")
		.replace(/^(?:[#>+=-]+|\d+[.)])\s+(?=\S)/, "")
		.trim();
	return limit && text.length > limit
		? `${text.slice(0, limit - 1).trimEnd()}…`
		: text;
}

export function sentence(value: string): string {
	return !value || /[.!?…]$/.test(value) ? value : `${value}.`;
}

export function bold(names: readonly string[]): string {
	return names.map((name) => `**${plain(name)}**`).join(", ");
}

export function quoted(values: readonly string[]): string {
	return values.map((value) => `“${plain(value)}”`).join(", ");
}

const SHOWN = 3;

/**
 * What a frame's committed markup actually contains, as short Markdown bullet
 * bodies. Only counted or quoted observations appear, so a description can
 * never promise a control the screen lacks.
 */
export function observedItems(facts: StudioFrameFacts | undefined): string[] {
	if (!facts) return [];
	const items: string[] = [];
	const add = (label: string, values: readonly string[]) => {
		const shown = values.map((value) => plain(value)).filter(Boolean);
		if (shown.length) items.push(`${label}: ${quoted(shown.slice(0, SHOWN))}`);
	};
	add("Bagian", facts.headings);
	add("Navigasi", facts.navigation);
	add("Isian", facts.fields);
	add("Tombol", facts.actions);
	if (facts.forms) items.push(`${facts.forms} formulir`);
	if (facts.tables) items.push(`${facts.tables} tabel`);
	return items;
}

export function hasInteractiveFacts(facts: StudioFrameFacts | undefined) {
	return Boolean(
		facts && (facts.forms || facts.fields.length || facts.actions.length),
	);
}

/** True for a frame that carries forms or actions, so a limitation is relevant. */
export const PROTOTYPE_LIMITATION =
	"Ini antarmuka prototipe: tombol dan formulir hanya tampilan. Autentikasi, penyimpanan data, pembayaran, dan pengiriman email belum benar-benar berjalan.";
