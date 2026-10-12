import type { VisualElementEvidence } from "./design-visual-evidence";

// Evidence normalization. Turns raw computed CSS into canonical, deduplicated
// values that a design-system consumer can actually use, and keeps every
// classification traceable back to the measurement that produced it.
//
// Nothing here invents a value: normalization only rewrites a measured value
// into an equivalent canonical form, or decides which measured value a role
// should point at.

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

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

export type ColorRoleClass =
	| "brand"
	| "accent"
	| "neutral"
	| "semantic"
	| "unknown";

export interface ColorUsage {
	/** How many measured elements painted this colour for this property. */
	frequency: number;
	/** Distinct element roles that used it. */
	roles: string[];
	/** Distinct CSS properties it was measured on. */
	properties: string[];
	/**
	 * Role/property pairs observed together, e.g. "cta:background-color". Role and
	 * property must stay paired: a colour can be an action fill on one element and
	 * a canvas background on another, and conflating the two would invent an
	 * action colour that was never measured.
	 */
	contexts: string[];
	/** True when the colour resolves from a named custom property in the page. */
	hasVariableEvidence: boolean;
	/** Custom property names that resolved to this colour, when observed. */
	variableNames: string[];
	/** Selectors kept for audit. */
	selectors: string[];
}

export function colorContext(role: string, property: string): string {
	return `${role}:${property}`;
}

export function contextFrequency(usage: ColorUsage, context: string): number {
	return usage.contexts.filter((entry) => entry === context).length;
}

export interface NormalizedColorToken {
	/** Canonical value, deduplicated across equivalent representations. */
	color: NormalizedColor;
	usage: ColorUsage;
}

export interface ColorMeasurement {
	element: VisualElementEvidence;
	property: string;
	value: string;
}

const AUDIT_SELECTOR_LIMIT = 3;
const AUDIT_ROLE_LIMIT = 6;

// Collects every colour-bearing property measurement that actually paints
// something. Fully transparent paints and borders with no width are excluded
// because they cannot form part of the visible palette.
export function collectColorMeasurements(
	elements: VisualElementEvidence[],
): ColorMeasurement[] {
	const measurements: ColorMeasurement[] = [];
	for (const element of elements) {
		const properties = element.properties;
		for (const property of ["background-color", "color", "border-top-color"]) {
			const value = properties[property];
			if (!value) continue;
			if (
				property === "border-top-color" &&
				(properties["border-top-style"] === "none" ||
					properties["border-top-width"] === "0px")
			)
				continue;
			const normalized = normalizeColor(value);
			if (!normalized || normalized.isNoOp) continue;
			measurements.push({ element, property, value });
		}
	}
	return measurements;
}

// Collapses equivalent colour representations into one token and records how it
// was used. Two spellings of the same colour must never become two tokens.
export function normalizeColors(
	elements: VisualElementEvidence[],
): NormalizedColorToken[] {
	const tokens = new Map<string, NormalizedColorToken>();
	for (const measurement of collectColorMeasurements(elements)) {
		const normalized = normalizeColor(measurement.value);
		if (!normalized || normalized.isNoOp) continue;
		// Key on the opaque identity plus the alpha bucket, so #fff and
		// rgb(255,255,255) merge while a 50% variant stays distinct.
		const key = `${normalized.hex}@${normalized.a.toFixed(3)}`;
		const context = colorContext(
			measurement.element.role,
			measurement.property,
		);
		const existing = tokens.get(key);
		if (existing) {
			existing.usage.frequency += 1;
			existing.usage.contexts.push(context);
			if (
				existing.usage.roles.length < AUDIT_ROLE_LIMIT &&
				!existing.usage.roles.includes(measurement.element.role)
			)
				existing.usage.roles.push(measurement.element.role);
			if (!existing.usage.properties.includes(measurement.property))
				existing.usage.properties.push(measurement.property);
			if (
				existing.usage.selectors.length < AUDIT_SELECTOR_LIMIT &&
				!existing.usage.selectors.includes(measurement.element.selector)
			)
				existing.usage.selectors.push(measurement.element.selector);
			const variableNames = matchingVariableNames(measurement);
			for (const name of variableNames) {
				existing.usage.hasVariableEvidence = true;
				if (!existing.usage.variableNames.includes(name))
					existing.usage.variableNames.push(name);
			}
			continue;
		}
		const variableNames = matchingVariableNames(measurement);
		tokens.set(key, {
			color: normalized,
			usage: {
				frequency: 1,
				roles: [measurement.element.role],
				properties: [measurement.property],
				contexts: [context],
				hasVariableEvidence: variableNames.length > 0,
				variableNames,
				selectors: [measurement.element.selector],
			},
		});
	}
	return [...tokens.values()].sort(
		(a, b) =>
			b.usage.frequency - a.usage.frequency ||
			a.color.hex.localeCompare(b.color.hex),
	);
}

// Custom properties are only evidence for a colour when the element that
// declared them actually painted that colour.
function matchingVariableNames(measurement: ColorMeasurement): string[] {
	const variables = measurement.element.variables ?? {};
	const normalized = normalizeColor(measurement.value);
	if (!normalized) return [];
	return Object.entries(variables)
		.filter(([, value]) => {
			const candidate = normalizeColor(value);
			return (
				candidate !== null &&
				candidate.hex === normalized.hex &&
				candidate.a === normalized.a
			);
		})
		.map(([name]) => name);
}

// The user-agent text colour. A page that never styles `color` still reports
// this value, so it must not be presented as a brand decision.
const USER_AGENT_TEXT = "#000000";

export interface ColorClassification {
	token: NormalizedColorToken;
	roleClass: ColorRoleClass;
	/** Human-readable role name derived from measured usage. */
	roleLabel: string;
	/** Why this classification was chosen, in plain language. */
	rationale: string;
	/** True when the only evidence is the user-agent default. */
	userAgentDefault: boolean;
}

const SEMANTIC_NAME =
	/(?:^|[^a-z])(success|warning|error|danger|info)(?:[^a-z]|$)/i;
const BRAND_NAME = /(?:^|[^a-z])(brand|primary|accent|action|cta)(?:[^a-z]|$)/i;
const NEUTRAL_NAME =
	/(?:^|[^a-z])(neutral|gray|grey|slate|zinc|stone|neutral|canvas|surface|text|border|background|ink|muted)(?:[^a-z]|$)/i;

function roleLabelFor(
	token: NormalizedColorToken,
	roleClass: ColorRoleClass,
): string {
	// Label from the paired contexts so a colour that fills an action button and
	// also paints text is described by what it actually did, not by the union of
	// every role and property it ever appeared in.
	const fillsAction =
		contextFrequency(token.usage, colorContext("cta", "background-color")) > 0;
	const paintsText = token.usage.contexts.some((entry) =>
		entry.endsWith(":color"),
	);
	const paintsBorder = token.usage.contexts.some((entry) =>
		entry.endsWith(":border-top-color"),
	);
	const fillsBackground = token.usage.contexts.some((entry) =>
		entry.endsWith(":background-color"),
	);
	const onCanvas = token.usage.roles.includes("canvas");
	if (roleClass === "brand" && fillsAction) return "Primary action";
	if (roleClass === "brand") return "Brand accent";
	if (roleClass === "accent") return "Accent";
	if (roleClass === "semantic") return "Semantic state";
	if (paintsText && fillsBackground) return "Text and surface";
	if (paintsText) return onCanvas ? "Base text" : "Text";
	if (paintsBorder) return "Border";
	if (fillsBackground) return fillsAction ? "Action surface" : "Surface";
	return "Neutral";
}

// Classifies a normalized palette using measured usage only. A colour is never
// promoted to brand because it looks important: it must be repeated on action
// elements, or resolve from a custom property the page named for that role.
export function classifyColorToken(
	token: NormalizedColorToken,
): ColorClassification {
	const haystack = token.usage.variableNames.join(" ");
	const isUserAgentDefault =
		token.color.hex === USER_AGENT_TEXT &&
		!token.usage.hasVariableEvidence &&
		token.usage.roles.every((role) => role === "element" || role === "body");
	if (isUserAgentDefault)
		return {
			token,
			roleClass: "neutral",
			roleLabel: "Default text",
			rationale:
				"Matches the user-agent text colour and carries no custom-property evidence, so it is not treated as a brand decision.",
			userAgentDefault: true,
		};
	if (SEMANTIC_NAME.test(haystack))
		return {
			token,
			roleClass: "semantic",
			roleLabel: "Semantic state",
			rationale:
				"Resolved from a custom property the page named after a state, so it reads as a semantic colour rather than decoration.",
			userAgentDefault: false,
		};
	if (BRAND_NAME.test(haystack))
		return {
			token,
			roleClass: "brand",
			roleLabel: roleLabelFor(token, "brand"),
			rationale:
				"Resolved from a custom property the page named for its brand or primary action.",
			userAgentDefault: false,
		};
	// Only a filled action surface can establish a primary action colour. Text
	// painted on an action element is not the action colour itself, so the check
	// reads the paired role/property context rather than the two lists.
	const actionFill = contextFrequency(
		token.usage,
		colorContext("cta", "background-color"),
	);
	if (actionFill >= 2)
		return {
			token,
			roleClass: "brand",
			roleLabel: "Primary action",
			rationale: `Painted the background of ${actionFill} measured action elements, which is repeated evidence of a primary action colour.`,
			userAgentDefault: false,
		};
	const onAction = token.usage.roles.includes("cta");
	if (onAction)
		return {
			token,
			roleClass: "accent",
			roleLabel: "Action accent",
			rationale:
				"Appeared on action elements without repeated fill evidence, so it is recorded as an accent rather than a confirmed primary colour.",
			userAgentDefault: false,
		};
	if (NEUTRAL_NAME.test(haystack))
		return {
			token,
			roleClass: "neutral",
			roleLabel: roleLabelFor(token, "neutral"),
			rationale:
				"Resolved from a custom property the page named for a structural role.",
			userAgentDefault: false,
		};
	const surfaceOnly =
		token.usage.properties.includes("background-color") &&
		token.usage.frequency >= 2;
	return {
		token,
		roleClass: surfaceOnly ? "neutral" : "unknown",
		roleLabel: roleLabelFor(token, surfaceOnly ? "neutral" : "unknown"),
		rationale: surfaceOnly
			? `Repeated on ${token.usage.frequency} measured surfaces, so it reads as a structural surface colour.`
			: "Measured usage is too thin to assign a brand, accent or semantic role.",
		userAgentDefault: false,
	};
}

export function classifyColors(
	elements: VisualElementEvidence[],
): ColorClassification[] {
	return normalizeColors(elements).map(classifyColorToken);
}
