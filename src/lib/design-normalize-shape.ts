import { normalizeColor } from "./design-normalize-color";
import { parsePx } from "./design-normalize-typography";
import {
	type GroupedMeasurement,
	groupMeasurements,
	type VisualElementEvidence,
} from "./design-visual-evidence";

// Spacing, radius and elevation normalization. Raw grouping already collapses
// identical property/value pairs, but a flat list of "padding · 1 element" rows
// is an audit dump, not a design system. This module assigns each measured value
// to the context it was measured in so the document can describe usage.

export type SpacingPurpose =
	| "Section gap"
	| "Container max-width"
	| "Card padding"
	| "Action padding"
	| "Element gap"
	| "Navigation spacing"
	| "Repeated spacing scale"
	| "Measured spacing";

export interface SpacingToken {
	purpose: SpacingPurpose;
	property: string;
	value: string;
	valuePx: number;
	frequency: number;
	/** Element roles this value was measured on. */
	roles: string[];
	selectors: string[];
	/** True when the value is part of a repeated numeric scale. */
	onScale: boolean;
}

export type RadiusPurpose =
	| "Buttons"
	| "Inputs"
	| "Navigation"
	| "Cards"
	| "Large cards"
	| "Icons and tags"
	| "Measured radius";

export interface RadiusToken {
	purpose: RadiusPurpose;
	value: string;
	valuePx: number;
	frequency: number;
	roles: string[];
	selectors: string[];
	/** True when the value came from elements that were not generic containers. */
	contextual: boolean;
}

export interface ElevationToken {
	value: string;
	frequency: number;
	roles: string[];
	selectors: string[];
	/** How many distinct elements carried this exact shadow. */
	usageNote: string;
}

const AUDIT_LIMIT = 3;

function pxOf(value: string): number {
	const direct = parsePx(value);
	if (Number.isFinite(direct)) return direct;
	// Multi-value shorthands report several lengths; the largest drives the scale.
	// Supports scientific notation so an extreme computed value is measured
	// correctly instead of being misparsed from a substring.
	const matches = [...value.matchAll(/(-?[\d.]+(?:[eE][+-]?\d+)?)px/g)].map(
		(match) => Number.parseFloat(match[1] ?? ""),
	);
	const finite = matches.filter((entry) => Number.isFinite(entry));
	return finite.length ? Math.max(...finite) : Number.NaN;
}

// The spacing step that explains the most measurements.
//
// Two rules keep this honest. The step must account for nearly every measured
// value, and it must be at least 4px: every set of even numbers is divisible by
// 2, so reporting "2px" would always succeed while describing no real rhythm.
// When nothing satisfies both, the capture has no single grid and that is
// reported as a gap instead of an invented unit.
const BASE_UNIT_CANDIDATES = [4, 6, 8, 10, 12, 16, 20, 24, 32] as const;
const BASE_UNIT_COVERAGE = 0.9;

export function inferSpacingBaseUnit(
	elements: VisualElementEvidence[],
): number {
	const observations: { value: number; frequency: number }[] = [];
	for (const group of groupMeasurements(elements, ["padding", "gap"])) {
		const value = pxOf(group.value);
		if (!Number.isFinite(value) || value <= 0) continue;
		observations.push({ value, frequency: group.frequency });
	}
	if (!observations.length) return Number.NaN;
	const total = observations.reduce((sum, entry) => sum + entry.frequency, 0);
	const coverage = BASE_UNIT_CANDIDATES.map((candidate) => ({
		candidate,
		covered: observations
			.filter((entry) => entry.value % candidate === 0)
			.reduce((sum, entry) => sum + entry.frequency, 0),
	}));
	const bestCoverage = coverage.reduce(
		(best, entry) => Math.max(best, entry.covered),
		0,
	);
	if (bestCoverage / total < BASE_UNIT_COVERAGE) return Number.NaN;
	// Among candidates that explain the rhythm equally well, the largest is the
	// most informative step.
	return coverage
		.filter((entry) => entry.covered === bestCoverage)
		.reduce((largest, entry) => Math.max(largest, entry.candidate), 0);
}

function rolesFor(
	elements: VisualElementEvidence[],
	property: string,
	value: string,
): string[] {
	const roles: string[] = [];
	for (const element of elements) {
		if (element.properties[property] !== value) continue;
		if (!roles.includes(element.role)) roles.push(element.role);
	}
	return roles;
}

// Classifies a spacing value by the context it was measured in. A value only
// receives a purpose its evidence supports; everything else stays "measured".
export function classifySpacingToken(
	group: GroupedMeasurement,
	elements: VisualElementEvidence[],
	baseUnit: number,
): SpacingToken {
	const roles = rolesFor(elements, group.property, group.value);
	const valuePx = pxOf(group.value);
	const onScale =
		Number.isFinite(baseUnit) &&
		baseUnit > 0 &&
		Number.isFinite(valuePx) &&
		valuePx > 0 &&
		valuePx % baseUnit === 0;
	let purpose: SpacingPurpose = "Measured spacing";
	if (group.property === "max-width") purpose = "Container max-width";
	else if (roles.includes("nav")) purpose = "Navigation spacing";
	else if (roles.includes("cta") && group.property === "padding")
		purpose = "Action padding";
	else if (
		group.property === "padding" &&
		Number.isFinite(valuePx) &&
		valuePx > 0 &&
		(roles.includes("section") ||
			roles.includes("header") ||
			roles.includes("article") ||
			roles.includes("footer"))
	)
		purpose = "Card padding";
	else if (group.property === "gap" && group.frequency >= 2)
		purpose = "Element gap";
	else if (
		(group.property === "padding" || group.property === "margin") &&
		valuePx >= 48 &&
		onScale
	)
		purpose = "Section gap";
	else if (onScale && group.frequency >= 2) purpose = "Repeated spacing scale";
	return {
		purpose,
		property: group.property,
		value: group.value,
		valuePx,
		frequency: group.frequency,
		roles: roles.slice(0, 6),
		selectors: group.selectors.slice(0, AUDIT_LIMIT),
		onScale,
	};
}

export function normalizeSpacing(elements: VisualElementEvidence[]): {
	tokens: SpacingToken[];
	baseUnit: number;
} {
	const baseUnit = inferSpacingBaseUnit(elements);
	const tokens = groupMeasurements(elements, [
		"padding",
		"margin",
		"gap",
		"max-width",
	])
		.map((group) => classifySpacingToken(group, elements, baseUnit))
		// A value measured on a single generic element is not yet a system token;
		// it is kept only when its context proves a purpose.
		// Zero measurements are CSS reset defaults, not design rhythm: they are
		// kept only when a real component context gives them meaning.
		.filter((token) => {
			if (token.valuePx === 0 && token.purpose === "Measured spacing")
				return false;
			return (
				token.frequency > 1 ||
				token.purpose !== "Measured spacing" ||
				token.roles.some((role) => role !== "element")
			);
		})
		.sort(
			(a, b) =>
				b.frequency - a.frequency ||
				(Number.isFinite(b.valuePx) ? b.valuePx : 0) -
					(Number.isFinite(a.valuePx) ? a.valuePx : 0),
		);
	return { tokens, baseUnit };
}

// Radius values are meaningful by the component they round, so a 0px measured on
// hundreds of plain containers must not become the headline radius token.
export function classifyRadiusToken(
	group: GroupedMeasurement,
	elements: VisualElementEvidence[],
): RadiusToken {
	const roles = rolesFor(elements, "border-radius", group.value);
	const valuePx = pxOf(group.value);
	const contextual =
		roles.some((role) => role !== "element") || group.frequency >= 2;
	let purpose: RadiusPurpose = "Measured radius";
	if (roles.includes("cta")) purpose = "Buttons";
	else if (roles.includes("nav")) purpose = "Navigation";
	else if (roles.includes("section") || roles.includes("main"))
		purpose =
			Number.isFinite(valuePx) && valuePx >= 16 ? "Large cards" : "Cards";
	else if (roles.includes("header") || roles.includes("footer"))
		purpose = "Cards";
	else if (roles.includes("a") || roles.includes("img"))
		purpose = "Icons and tags";
	return {
		purpose,
		value: group.value,
		valuePx,
		frequency: group.frequency,
		roles: roles.slice(0, 6),
		selectors: group.selectors.slice(0, AUDIT_LIMIT),
		contextual,
	};
}

export function normalizeRadii(
	elements: VisualElementEvidence[],
): RadiusToken[] {
	return groupMeasurements(elements, ["border-radius"])
		.map((group) => classifyRadiusToken(group, elements))
		.filter((token) => {
			if (!token.contextual) return false;
			// Zero rounding on ordinary containers is the absence of a decision,
			// not a radius token. It only counts when a real component class was
			// measured square on purpose.
			if (token.valuePx === 0)
				return token.roles.some((role) => role !== "element");
			return true;
		})
		.sort(
			(a, b) =>
				b.frequency - a.frequency ||
				(Number.isFinite(b.valuePx) ? b.valuePx : 0) -
					(Number.isFinite(a.valuePx) ? a.valuePx : 0),
		);
}

export function normalizeElevation(
	elements: VisualElementEvidence[],
): ElevationToken[] {
	return groupMeasurements(elements, ["box-shadow"])
		.filter((group) => group.value !== "none" && group.value.trim().length > 0)
		.map((group) => ({
			value: group.value,
			frequency: group.frequency,
			roles: rolesFor(elements, "box-shadow", group.value).slice(0, 6),
			selectors: group.selectors.slice(0, AUDIT_LIMIT),
			usageNote: describeShadow(group.value, group.frequency),
		}))
		.sort((a, b) => b.frequency - a.frequency);
}

// Summarizes a raw shadow into readable measured structure. The original value
// stays as provenance; this note explains layers and extents without inventing
// a preset name.
function describeShadow(value: string, frequency: number): string {
	const layers = splitShadowLayers(value);
	const extent = largestShadowExtent(value);
	const base =
		frequency === 1
			? "Measured once, so it is not presented as a system elevation."
			: `Repeated across ${frequency} measured elements.`;
	if (layers <= 1 && !Number.isFinite(extent)) return base;
	const shape =
		layers > 1
			? `${layers} layers`
			: Number.isFinite(extent)
				? `blur ${extent}px`
				: "single layer";
	return `${base} Structure: ${shape}.`;
}

function splitShadowLayers(value: string): number {
	let depth = 0;
	let layers = 1;
	for (const char of value) {
		if (char === "(") depth += 1;
		else if (char === ")") depth = Math.max(0, depth - 1);
		else if (char === "," && depth === 0) layers += 1;
	}
	return value.trim().length ? layers : 0;
}

function largestShadowExtent(value: string): number {
	const matches = [...value.matchAll(/(-?[\d.]+(?:[eE][+-]?\d+)?)px/g)].map(
		(match) => Number.parseFloat(match[1] ?? ""),
	);
	const finite = matches.filter((entry) => Number.isFinite(entry));
	return finite.length
		? Math.max(...finite.map((entry) => Math.abs(entry)))
		: Number.NaN;
}

// Pill and fully-rounded shapes come from very large radii. The original value
// is preserved as provenance; the magnitude only informs the description.
export const PILL_RADIUS_PX = 120;

export function isPillRadius(valuePx: number): boolean {
	return Number.isFinite(valuePx) && valuePx >= PILL_RADIUS_PX;
}

// Surfaces are the background colours that cover large areas, ordered from the
// most to the least used, so the document can describe a surface stack.
export interface SurfaceToken {
	value: string;
	frequency: number;
	roles: string[];
	selectors: string[];
}

export function normalizeSurfaces(
	elements: VisualElementEvidence[],
): SurfaceToken[] {
	const seen = new Map<string, SurfaceToken>();
	for (const group of groupMeasurements(elements, ["background-color"])) {
		const normalized = normalizeColor(group.value);
		// Fully transparent paint contributes nothing visible and must never
		// become the only surface.
		if (!normalized || normalized.isNoOp) continue;
		const roles = rolesFor(elements, "background-color", group.value);
		const isPageSurface = roles.some((role) =>
			["canvas", "main", "section", "header", "footer", "nav"].includes(role),
		);
		if (group.frequency < 2 || !isPageSurface) continue;
		const key = `${normalized.hex}@${normalized.a.toFixed(3)}`;
		const existing = seen.get(key);
		if (existing) {
			existing.frequency += group.frequency;
			for (const role of roles)
				if (!existing.roles.includes(role) && existing.roles.length < 6)
					existing.roles.push(role);
			for (const selector of group.selectors)
				if (
					!existing.selectors.includes(selector) &&
					existing.selectors.length < AUDIT_LIMIT
				)
					existing.selectors.push(selector);
			continue;
		}
		seen.set(key, {
			value: normalized.css,
			frequency: group.frequency,
			roles: roles.slice(0, 6),
			selectors: group.selectors.slice(0, AUDIT_LIMIT),
		});
	}
	return [...seen.values()].sort((a, b) => b.frequency - a.frequency);
}
