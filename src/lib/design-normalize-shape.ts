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
	const matches = [...value.matchAll(/(-?[\d.]+)px/g)].map((match) =>
		Number.parseFloat(match[1] ?? ""),
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
		(roles.includes("section") ||
			roles.includes("main") ||
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
		.filter(
			(token) =>
				token.frequency > 1 ||
				token.purpose !== "Measured spacing" ||
				token.roles.some((role) => role !== "element"),
		)
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
			usageNote:
				group.frequency === 1
					? "Measured once, so it is not presented as a system elevation."
					: `Repeated across ${group.frequency} measured elements.`,
		}))
		.sort((a, b) => b.frequency - a.frequency);
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
	return groupMeasurements(elements, ["background-color"])
		.filter((group) => {
			const roles = rolesFor(elements, "background-color", group.value);
			return (
				group.frequency >= 2 &&
				roles.some((role) =>
					[
						"canvas",
						"body",
						"main",
						"section",
						"header",
						"footer",
						"div",
					].includes(role),
				)
			);
		})
		.map((group) => ({
			value: group.value,
			frequency: group.frequency,
			roles: rolesFor(elements, "background-color", group.value).slice(0, 6),
			selectors: group.selectors.slice(0, AUDIT_LIMIT),
		}))
		.sort((a, b) => b.frequency - a.frequency);
}
