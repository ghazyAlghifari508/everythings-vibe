import type { DesignTokenModel } from "../services/design-model";

// Only values that are valid CSS are emitted into a stylesheet block. Anything
// else is dropped rather than shipped as a broken declaration.
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA =
	/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i;
const CSS_LENGTH =
	/^-?(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em|%|vw|vh|vmin|vmax|dvh|dvw|ch|ex|cap|lh|cqw|cqh)$/;
const CSS_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function isValidCssColor(value: string): boolean {
	const trimmed = value.trim();
	if (HEX.test(trimmed)) return true;
	const match = trimmed.match(RGBA);
	if (!match) return false;
	const r = Number(match[1]);
	const g = Number(match[2]);
	const b = Number(match[3]);
	const a = match[4] === undefined ? 1 : Number(match[4]);
	return (
		Number.isFinite(r) &&
		Number.isFinite(g) &&
		Number.isFinite(b) &&
		Number.isFinite(a) &&
		r >= 0 &&
		r <= 255 &&
		g >= 0 &&
		g <= 255 &&
		b >= 0 &&
		b <= 255 &&
		a >= 0 &&
		a <= 1 &&
		match[4] !== "."
	);
}

export function isValidCssLength(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed === "0") return true;
	return CSS_LENGTH.test(trimmed);
}

// A CSS custom property name must be a valid identifier. Names derived from a
// role label are slugged, and a name that cannot be slugged is dropped.
export function tokenName(prefix: string, label: string): string | null {
	const slug = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug.length > 0 ? `${prefix}-${slug}` : null;
}

// Two measurements can share a purpose label while holding different values, so
// a naive slug would emit the same custom property twice with conflicting
// values. Later duplicates are suffixed to keep every declaration valid and
// unambiguous.
function uniqueTokenNames(
	entries: { name: string; value: string }[],
): { name: string; value: string }[] {
	const used = new Set<string>();
	return entries.map((entry) => {
		if (!used.has(entry.name)) {
			used.add(entry.name);
			return entry;
		}
		let suffix = 2;
		while (used.has(`${entry.name}-${suffix}`)) suffix += 1;
		const name = `${entry.name}-${suffix}`;
		used.add(name);
		return { name, value: entry.value };
	});
}

export interface TokenDeclarations {
	color: string[];
	font: string[];
	type: string[];
	spacing: string[];
	container: string[];
	radius: string[];
}

// Only tokens that pass validation reach the stylesheet, and generated
// implementation aliases are labelled as generated rather than presented as
// the website's own variables.
// Semantic names reflect validated meaning: unknown or unproven roles use
// measured-N aliases instead of brand/accent claims.
export function buildTokenDeclarations(
	model: DesignTokenModel,
): TokenDeclarations {
	const colorEntries = uniqueTokenNames(
		model.colors.flatMap((color, index) => {
			if (!isValidCssColor(color.value)) return [];
			const label =
				color.roleClass === "unknown" || color.confidence === "unknown"
					? `measured ${index + 1}`
					: color.role;
			const name = tokenName("--color", label);
			return name ? [{ name, value: color.value }] : [];
		}),
	);
	const spacingEntries = uniqueTokenNames(
		model.spacing.flatMap((token) => {
			// Container widths are not spacing steps: they live under the
			// Tailwind v4 container scale instead of the spacing namespace.
			if (token.purpose === "Container max-width") return [];
			if (!isValidCssLength(token.value)) return [];
			const name = tokenName("--spacing", token.purpose);
			return name ? [{ name, value: token.value }] : [];
		}),
	);
	// Measured max-widths map to the Tailwind v4 container scale, so they
	// generate max-width utilities instead of corrupting the spacing scale.
	const containerEntries = uniqueTokenNames(
		model.spacing.flatMap((token) => {
			if (token.purpose !== "Container max-width") return [];
			if (!isValidCssLength(token.value)) return [];
			const name = tokenName("--container", "max-width");
			return name ? [{ name, value: token.value }] : [];
		}),
	);
	const radiusEntries = uniqueTokenNames(
		model.radii.flatMap((token) => {
			if (!isValidCssLength(token.value)) return [];
			const name = tokenName("--radius", token.purpose);
			return name ? [{ name, value: token.value }] : [];
		}),
	);
	const typeEntries = uniqueTokenNames(
		model.typography.flatMap((entry) => {
			const entries: { name: string; value: string }[] = [];
			const sizeName = tokenName("--text", entry.role);
			if (sizeName && isValidCssLength(entry.fontSize))
				entries.push({ name: sizeName, value: entry.fontSize });
			const leadingName = tokenName("--leading", entry.role);
			if (
				leadingName &&
				(CSS_NUMBER.test(entry.lineHeight.trim()) ||
					isValidCssLength(entry.lineHeight))
			)
				entries.push({ name: leadingName, value: entry.lineHeight });
			const trackingName = tokenName("--tracking", entry.role);
			if (
				trackingName &&
				(entry.letterSpacing.trim() === "normal" ||
					isValidCssLength(entry.letterSpacing))
			)
				entries.push({ name: trackingName, value: entry.letterSpacing });
			return entries;
		}),
	);
	const fontEntries = uniqueTokenNames(
		model.typefaces.flatMap((typeface) => {
			const name = tokenName("--font", typeface.family);
			// A family name can only enter a declaration when it cannot break the
			// CSS syntax. Unicode letters are allowed for CJK families.
			return name && /^[\w\s,'"\-\p{L}\p{M}]+$/u.test(typeface.stack)
				? [{ name, value: typeface.stack }]
				: [];
		}),
	);
	const declaration = (entry: { name: string; value: string }) =>
		`  ${entry.name}: ${entry.value};`;
	return {
		color: colorEntries.map(declaration),
		font: fontEntries.map(declaration),
		type: typeEntries.map(declaration),
		spacing: spacingEntries.map(declaration),
		container: containerEntries.map(declaration),
		radius: radiusEntries.map(declaration),
	};
}

// The CSS and Tailwind outputs group the same declarations in the same order,
// so both are emitted through one builder.
export function propertyBlocks(
	groups: [label: string, declarations: string[]][],
): string[] {
	return groups.flatMap(([label, declarations]) =>
		declarations.length
			? [[`  /* ${label} */`, ...declarations].join("\n")]
			: [],
	);
}
