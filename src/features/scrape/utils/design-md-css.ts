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

export function isValidCssRadius(value: string): boolean {
	const axes = value.split("/");
	return (
		axes.length <= 2 &&
		axes.every((axis) => {
			const parts = axis.trim().split(/\s+/).filter(Boolean);
			return (
				parts.length >= 1 &&
				parts.length <= 4 &&
				parts.every((part) => !part.startsWith("-") && isValidCssLength(part))
			);
		})
	);
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

export interface TokenEntry {
	group: keyof TokenDeclarations;
	name: string;
	value: string;
}

const GROUP_ORDER: (keyof TokenDeclarations)[] = [
	"color",
	"font",
	"type",
	"spacing",
	"container",
	"radius",
];

// The radius alias says which component class the rounding belongs to. A pill
// treatment keeps its own alias instead of becoming an unexplained `-2` suffix,
// and a capture scope never leaks into a property name because scoped values are
// emitted as overrides instead of extra global aliases.
export function radiusAliasLabel(token: DesignTokenModel["radii"][number]): string {
	const base =
		token.purpose === "Measured radius"
			? (token.roles[0] ?? "measured")
			: token.purpose;
	return token.pill ? `${base} pill` : base;
}

// Only tokens that pass validation reach the stylesheet, and generated
// implementation aliases are labelled as generated rather than presented as
// the website's own variables.
// Semantic names reflect validated meaning: unknown or unproven roles use
// measured-N aliases instead of brand/accent claims.
export function tokenEntries(model: DesignTokenModel): TokenEntry[] {
	const entries: TokenEntry[] = [];
	const add = (
		group: keyof TokenDeclarations,
		candidates: { name: string | null; value: string }[],
	) => {
		const named = candidates.filter(
			(candidate): candidate is { name: string; value: string } =>
				candidate.name !== null && candidate.value.trim().length > 0,
		);
		for (const entry of uniqueTokenNames(named))
			entries.push({ group, name: entry.name, value: entry.value });
	};
	add(
		"color",
		model.colors.map((color, index) => {
			if (!isValidCssColor(color.value)) return { name: null, value: "" };
			const label =
				color.roleClass === "unknown" || color.confidence === "unknown"
					? `measured ${index + 1}`
					: color.role;
			return { name: tokenName("--color", label), value: color.value };
		}),
	);
	add(
		"font",
		model.typefaces.map((typeface) => ({
			name: tokenName("--font", typeface.family),
			// A family name can only enter a declaration when it cannot break the
			// CSS syntax. Unicode letters are allowed for CJK families.
			value: /^[\w\s,'"\-\p{L}\p{M}]+$/u.test(typeface.stack)
				? typeface.stack
				: "",
		})),
	);
	const type: { name: string | null; value: string }[] = [];
	for (const entry of model.typography) {
		const sizeName = tokenName("--text", entry.role);
		if (sizeName && isValidCssLength(entry.fontSize))
			type.push({ name: sizeName, value: entry.fontSize });
		const leadingName = tokenName("--leading", entry.role);
		if (
			leadingName &&
			(CSS_NUMBER.test(entry.lineHeight.trim()) ||
				isValidCssLength(entry.lineHeight))
		)
			type.push({ name: leadingName, value: entry.lineHeight });
		const trackingName = tokenName("--tracking", entry.role);
		// `normal` is a reset, not a measured tracking decision, so it would ship
		// a token with no implementation meaning.
		if (
			trackingName &&
			entry.letterSpacing.trim() !== "normal" &&
			isValidCssLength(entry.letterSpacing)
		)
			type.push({ name: trackingName, value: entry.letterSpacing });
	}
	add("type", type);
	add(
		"spacing",
		// Container widths are not spacing steps: they live under the Tailwind v4
		// container scale instead of the spacing namespace.
		model.spacing.map((token) => ({
			name:
				token.purpose === "Container max-width" ||
				!isValidCssLength(token.value)
					? null
					: tokenName("--spacing", token.purpose),
			value: token.value,
		})),
	);
	// Measured max-widths map to the Tailwind v4 container scale, so they
	// generate max-width utilities instead of corrupting the spacing scale.
	add(
		"container",
		model.spacing.map((token) => ({
			name:
				token.purpose === "Container max-width" &&
				isValidCssLength(token.value)
					? tokenName("--container", "max-width")
					: null,
			value: token.value,
		})),
	);
	add(
		"radius",
		model.radii.map((token) => ({
			name: isValidCssRadius(token.value)
				? tokenName("--radius", radiusAliasLabel(token))
				: null,
			value: token.value,
		})),
	);
	return entries.sort(
		(a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
	);
}

// Only tokens that pass validation reach the stylesheet, and generated
// implementation aliases are labelled as generated rather than presented as
// the website's own variables.
export function buildTokenDeclarations(
	model: DesignTokenModel,
): TokenDeclarations {
	const declarations: TokenDeclarations = {
		color: [],
		font: [],
		type: [],
		spacing: [],
		container: [],
		radius: [],
	};
	for (const entry of tokenEntries(model))
		declarations[entry.group].push(`  ${entry.name}: ${entry.value};`);
	return declarations;
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
