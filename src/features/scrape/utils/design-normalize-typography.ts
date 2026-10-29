import type { VisualElementEvidence } from "../services/design-visual-evidence";

// Typography normalization. Raw captures store one row per element, which for a
// paragraph-heavy page produces dozens of near-identical "body" entries. This
// module groups them by the properties that actually distinguish a type style
// and assigns one representative per role in a real type scale.

export type TypeScaleRole =
	| "Display"
	| "Large heading"
	| "Heading"
	| "Subheading"
	| "Body large"
	| "Body"
	| "Body small"
	| "Caption"
	| "UI label"
	| "Monospace"
	| "Unknown";

export interface TypeSpecimen {
	role: TypeScaleRole;
	fontFamily: string;
	fontSize: string;
	fontSizePx: number;
	fontWeight: string;
	lineHeight: string;
	letterSpacing: string;
	/** How many measured elements shared this exact combination. */
	frequency: number;
	/** Distinct element roles, e.g. h1, body, cta. */
	elementRoles: string[];
	/**
	 * Raw page text kept for validation only. It is never rendered as the public
	 * specimen: the published document must not replay the reference site's copy.
	 */
	sample: string;
	selectors: string[];
}

const AUDIT_SELECTOR_LIMIT = 3;
const SAMPLE_CHARS = 64;

// Specimen copy per role. A type specimen exists to show the character of the
// measured style, not to reproduce the page it came from, so every role gets
// neutral text short enough to wrap inside a narrow panel.
const SPECIMEN_TEXT: Record<string, string> = {
	display: "Design starts here",
	"large heading": "Build something great",
	heading: "Structure that reads clearly",
	subheading: "Supporting detail, kept short",
	"body large": "The quick brown fox jumps over the lazy dog.",
	body: "The quick brown fox jumps over the lazy dog.",
	"body small": "The quick brown fox jumps over the lazy dog.",
	caption: "Measured in the browser",
	"ui label": "Get started",
	monospace: "const value = 42;",
};
const SPECIMEN_FALLBACK = SPECIMEN_TEXT.body ?? "";

// Roles reach here as either a bare scale role or one scoped to a capture, e.g.
// "Display (Capture 2: 768x1024, browser preference dark)".
export function specimenTextForRole(role: string): string {
	const base = role.split(" (")[0]?.trim().toLowerCase() ?? "";
	return SPECIMEN_TEXT[base] ?? SPECIMEN_FALLBACK;
}

// The properties that define a type style. Tracking and family matter because
// two headings at the same size but different families are different styles.
const TYPE_PROPERTIES = [
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"letter-spacing",
] as const;

export function parsePx(value: string): number {
	const match = value.trim().match(/^(-?[\d.]+(?:[eE][+-]?\d+)?)px$/);
	if (!match?.[1]) return Number.NaN;
	const parsed = Number.parseFloat(match[1]);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// font-family computed style is a full stack. The first entry is the family the
// author asked for; the rest are fallbacks the browser may have used instead.
export function primaryFontFamily(stack: string): string {
	const first = stack.split(",")[0]?.trim() ?? "";
	return first.replace(/^["']|["']$/g, "");
}

export function normalizeFontWeight(value: string): string {
	const numeric = value.trim().match(/^(\d{3})\b/)?.[1];
	if (numeric) return numeric;
	const keyword = value.trim().match(/^(bold|normal|bolder|lighter)\b/i)?.[1];
	if (!keyword) return "";
	const lowered = keyword.toLowerCase();
	if (lowered === "bold") return "700";
	if (lowered === "normal") return "400";
	return lowered;
}

const MONOSPACE_HINT = /mono|code|consolas|menlo|courier/i;

// Assigns the scale role from the measured size plus the element's own role.
// Names are a classification of the measurement, never a claim about the site's
// own naming.
export function classifyTypeRole(
	fontSizePx: number,
	elementRoles: string[],
	fontFamily: string,
): TypeScaleRole {
	if (MONOSPACE_HINT.test(primaryFontFamily(fontFamily))) return "Monospace";
	const heading = elementRoles.some((role) => /^h[1-6]$/.test(role));
	const isH1 = elementRoles.includes("h1");
	const isH2 = elementRoles.includes("h2");
	if (heading) {
		if (isH1 && fontSizePx >= 40) return "Display";
		if (fontSizePx >= 40) return "Display";
		if (fontSizePx >= 28) return isH1 || isH2 ? "Large heading" : "Heading";
		if (fontSizePx >= 22) return "Heading";
		return "Subheading";
	}
	const interactive = elementRoles.some((role) =>
		["cta", "nav", "a", "button"].includes(role),
	);
	if (interactive && fontSizePx >= 10 && fontSizePx < 14) return "UI label";
	if (fontSizePx >= 20) return "Body large";
	if (fontSizePx >= 15) return "Body";
	if (fontSizePx >= 13) return "Body small";
	if (fontSizePx >= 1) return "Caption";
	return "Unknown";
}

const ROLE_ORDER: TypeScaleRole[] = [
	"Display",
	"Large heading",
	"Heading",
	"Subheading",
	"Body large",
	"Body",
	"Body small",
	"Caption",
	"UI label",
	"Monospace",
	"Unknown",
];

export function typeRoleRank(role: TypeScaleRole): number {
	const index = ROLE_ORDER.indexOf(role);
	return index === -1 ? ROLE_ORDER.length : index;
}

// Groups every measured text-bearing element into one specimen per distinct
// type style, keeping the largest and most frequent representative per role.
export function groupTypeSpecimens(
	elements: VisualElementEvidence[],
	preserveVariants = false,
): TypeSpecimen[] {
	const groups = new Map<string, TypeSpecimen>();
	for (const element of elements) {
		// Canvas elements carry the document default, not a design decision, and
		// elements without measured text cannot demonstrate a type style.
		if (element.role === "canvas") continue;
		if (!element.text.trim()) continue;
		const properties = element.properties;
		const family = properties["font-family"] ?? "";
		const size = properties["font-size"] ?? "";
		const sizePx = parsePx(size);
		if (!family || !Number.isFinite(sizePx)) continue;
		const weight = normalizeFontWeight(properties["font-weight"] ?? "");
		const lineHeight = properties["line-height"] ?? "";
		const letterSpacing = properties["letter-spacing"] ?? "";
		const key = [family, size, weight, lineHeight, letterSpacing].join(
			"\u0000",
		);
		const role = classifyTypeRole(sizePx, [element.role], family);
		const existing = groups.get(key);
		if (existing) {
			existing.frequency += 1;
			if (
				existing.elementRoles.length < 6 &&
				!existing.elementRoles.includes(element.role)
			)
				existing.elementRoles.push(element.role);
			if (
				existing.selectors.length < AUDIT_SELECTOR_LIMIT &&
				!existing.selectors.includes(element.selector)
			)
				existing.selectors.push(element.selector);
			// Keep the longest raw sample for validation, not for display.
			if (element.text.length > existing.sample.length)
				existing.sample = element.text.slice(0, SAMPLE_CHARS);
			// Re-classify with the full set of element roles now that more elements
			// share this style.
			existing.role = classifyTypeRole(sizePx, existing.elementRoles, family);
			continue;
		}
		groups.set(key, {
			role,
			fontFamily: family,
			fontSize: size,
			fontSizePx: sizePx,
			fontWeight: weight,
			lineHeight,
			letterSpacing,
			frequency: 1,
			elementRoles: [element.role],
			sample: element.text.slice(0, SAMPLE_CHARS),
			selectors: [element.selector],
		});
	}
	if (preserveVariants) return [...groups.values()];
	// One representative per role keeps the scale a scale: the specimen with the
	// most measured usage wins, ties broken by the larger size.
	const byRole = new Map<TypeScaleRole, TypeSpecimen>();
	for (const specimen of groups.values()) {
		const existing = byRole.get(specimen.role);
		if (
			!existing ||
			specimen.frequency > existing.frequency ||
			(specimen.frequency === existing.frequency &&
				specimen.fontSizePx > existing.fontSizePx)
		)
			byRole.set(specimen.role, specimen);
	}
	return [...byRole.values()].sort(
		(a, b) =>
			typeRoleRank(a.role) - typeRoleRank(b.role) ||
			b.fontSizePx - a.fontSizePx,
	);
}

export interface FontFaceEvidence {
	family: string;
	weight: string;
	status: string;
}

export interface NormalizedTypeface {
	/** Canonical family name as declared by the page. */
	family: string;
	/** Full declared stack, for the CSS fallback chain. */
	stack: string;
	/** Distinct weights actually measured on rendered text. */
	measuredWeights: string[];
	/** Distinct sizes actually measured on rendered text. */
	measuredSizes: string[];
	/** Scale roles this family was measured on. */
	roles: TypeScaleRole[];
	lineHeights: string[];
	letterSpacings: string[];
	/** Font-face resources the page declared, and their load status. */
	declaredFaces: FontFaceEvidence[];
	/** True when the family has a font-face that finished loading. */
	loadedEvidence: boolean;
	/** True when this family is only a fallback in the measured stack. */
	fallbackOnly: boolean;
	/** Raw page text for this family; validation only, never a public specimen. */
	sample: string;
}

// Placeholder families are what a page writes before a webfont resolves. They
// are never a typeface of their own.
const PLACEHOLDER_FAMILY =
	/^(?:sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|inherit|initial|unset|revert)$/i;

export function isPlaceholderFamily(family: string): boolean {
	return PLACEHOLDER_FAMILY.test(family.trim());
}

// Normalizes fonts into typefaces. Declared font-face resources, the observed
// computed stack and the actually-rendered family are kept as separate facts so
// the document never claims a declared font is the font that rendered.
export function normalizeTypefaces(
	specimens: TypeSpecimen[],
	fontFaces: FontFaceEvidence[],
): NormalizedTypeface[] {
	const typefaces = new Map<string, NormalizedTypeface>();
	for (const specimen of specimens) {
		const family = primaryFontFamily(specimen.fontFamily);
		if (!family || isPlaceholderFamily(family)) continue;
		const existing = typefaces.get(family) ?? {
			family,
			stack: specimen.fontFamily,
			measuredWeights: [],
			measuredSizes: [],
			roles: [],
			lineHeights: [],
			letterSpacings: [],
			declaredFaces: [],
			loadedEvidence: false,
			fallbackOnly: false,
			sample: "",
		};
		if (
			specimen.fontWeight &&
			!existing.measuredWeights.includes(specimen.fontWeight)
		)
			existing.measuredWeights.push(specimen.fontWeight);
		if (
			specimen.fontSize &&
			!existing.measuredSizes.includes(specimen.fontSize)
		)
			existing.measuredSizes.push(specimen.fontSize);
		if (!existing.roles.includes(specimen.role))
			existing.roles.push(specimen.role);
		if (
			specimen.lineHeight &&
			!existing.lineHeights.includes(specimen.lineHeight)
		)
			existing.lineHeights.push(specimen.lineHeight);
		if (
			specimen.letterSpacing &&
			!existing.letterSpacings.includes(specimen.letterSpacing)
		)
			existing.letterSpacings.push(specimen.letterSpacing);
		// Longest raw sample only; display text comes from the role specimen.
		if (specimen.sample.length > existing.sample.length)
			existing.sample = specimen.sample;
		typefaces.set(family, existing);
	}
	for (const typeface of typefaces.values()) {
		const declared = fontFaces.filter(
			(face) => primaryFontFamily(face.family) === typeface.family,
		);
		typeface.declaredFaces = declared;
		typeface.loadedEvidence = declared.some((face) => face.status === "loaded");
		typeface.measuredWeights.sort();
		typeface.measuredSizes.sort((a, b) => parsePx(b) - parsePx(a));
		typeface.roles.sort((a, b) => typeRoleRank(a) - typeRoleRank(b));
	}
	return [...typefaces.values()].sort(
		(a, b) => b.measuredSizes.length - a.measuredSizes.length,
	);
}

export { TYPE_PROPERTIES };
