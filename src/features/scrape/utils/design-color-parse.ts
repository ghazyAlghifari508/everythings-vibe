// Parses a raw computed CSS colour into a canonical sRGB value. Nothing here
// invents a value: a colour the browser resolved from a modern colour space is
// returned as unparsed rather than guessed.

export interface RgbaColor {
	r: number;
	g: number;
	b: number;
	/** 0..1. */
	a: number;
}

export interface NormalizedColor extends RgbaColor {
	/** Canonical lowercase hex, without alpha. */
	hex: string;
	/** Canonical CSS the document and inspector can paste directly. */
	css: string;
	/** True when the colour is not fully opaque. */
	hasAlpha: boolean;
	/** True when the paint contributes nothing (fully transparent). */
	isNoOp: boolean;
}

const NAMED_COLORS: Record<string, string> = {
	transparent: "rgba(0, 0, 0, 0)",
	black: "rgb(0, 0, 0)",
	white: "rgb(255, 255, 255)",
	red: "rgb(255, 0, 0)",
	green: "rgb(0, 128, 0)",
	blue: "rgb(0, 0, 255)",
	gray: "rgb(128, 128, 128)",
	grey: "rgb(128, 128, 128)",
};

function clampChannel(value: number): number {
	return Math.min(255, Math.max(0, Math.round(value)));
}

function parseHex(value: string): RgbaColor | null {
	const match = value.match(/^#([0-9a-f]{3,8})$/i);
	if (!match?.[1]) return null;
	const digits = match[1];
	const expand = (chunk: string) =>
		chunk.length === 1 ? `${chunk}${chunk}` : chunk;
	if (digits.length === 3 || digits.length === 4) {
		const [r, g, b, a] = [
			expand(digits[0] ?? ""),
			expand(digits[1] ?? ""),
			expand(digits[2] ?? ""),
			digits[3] ? expand(digits[3]) : undefined,
		];
		return {
			r: Number.parseInt(r ?? "0", 16),
			g: Number.parseInt(g ?? "0", 16),
			b: Number.parseInt(b ?? "0", 16),
			a: a === undefined ? 1 : Number.parseInt(a, 16) / 255,
		};
	}
	if (digits.length === 6 || digits.length === 8) {
		return {
			r: Number.parseInt(digits.slice(0, 2), 16),
			g: Number.parseInt(digits.slice(2, 4), 16),
			b: Number.parseInt(digits.slice(4, 6), 16),
			a:
				digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
		};
	}
	return null;
}

// rgb()/rgba() accept both legacy comma syntax and modern space syntax, and the
// alpha channel may be a percentage. All forms collapse to one representation.
function parseFunctional(value: string): RgbaColor | null {
	const match = value.match(/^rgba?\(([^)]+)\)$/i);
	if (!match?.[1]) return null;
	const body = match[1].replace(/\//g, " ").replace(/,/g, " ");
	const parts = body.split(/\s+/).filter(Boolean);
	if (parts.length < 3) return null;
	const channel = (raw: string): number | null => {
		const trimmed = raw.trim();
		if (trimmed.endsWith("%")) {
			const percent = Number.parseFloat(trimmed);
			return Number.isFinite(percent) ? (percent / 100) * 255 : null;
		}
		const numeric = Number.parseFloat(trimmed);
		return Number.isFinite(numeric) ? numeric : null;
	};
	const r = channel(parts[0] ?? "");
	const g = channel(parts[1] ?? "");
	const b = channel(parts[2] ?? "");
	if (r === null || g === null || b === null) return null;
	const rawAlpha = parts[3];
	let a = 1;
	if (rawAlpha !== undefined) {
		const trimmed = rawAlpha.trim();
		const numeric = trimmed.endsWith("%")
			? Number.parseFloat(trimmed) / 100
			: Number.parseFloat(trimmed);
		a = Number.isFinite(numeric) ? numeric : 1;
	}
	return { r, g, b, a };
}

// A colour the browser resolved from a modern colour space cannot be reduced to
// sRGB without a conversion we do not have evidence for, so it is reported as
// unparsed rather than guessed.
export function normalizeColor(raw: string): NormalizedColor | null {
	const value = raw.trim().toLowerCase();
	if (!value) return null;
	const named = NAMED_COLORS[value];
	const source = named ?? value;
	if (/^(currentcolor|inherit|initial|unset|revert)$/.test(source)) return null;
	const parsed = source.startsWith("#")
		? parseHex(source)
		: parseFunctional(source);
	if (!parsed) return null;
	const r = clampChannel(parsed.r);
	const g = clampChannel(parsed.g);
	const b = clampChannel(parsed.b);
	const a = Math.min(1, Math.max(0, Number.isFinite(parsed.a) ? parsed.a : 1));
	const hex = `#${[r, g, b]
		.map((channelValue) => channelValue.toString(16).padStart(2, "0"))
		.join("")}`;
	const hasAlpha = a < 1;
	const css = hasAlpha
		? `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
		: hex;
	return { r, g, b, a, hex, css, hasAlpha, isNoOp: a === 0 };
}
