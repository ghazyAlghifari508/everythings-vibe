import {
	type GroupedMeasurement,
	groupMeasurements,
	type VisualElementEvidence,
} from "../services/design-visual-evidence";
import { AUDIT_LIMIT, pxOf, rolesFor } from "./design-shape-measure";

// Spacing normalization. Raw grouping already collapses identical
// property/value pairs, but a flat list of "padding · 1 element" rows is an
// audit dump, not a design system. This module assigns each measured value to
// the context it was measured in so the document can describe usage.
//
// Radius, elevation and surface tokens live in their own modules; their public
// names stay reachable from here because consumers import them from this path.

export {
	classifyRadiusToken,
	isPillRadius,
	normalizeRadii,
	PILL_RADIUS_PX,
	type RadiusPurpose,
	type RadiusToken,
} from "./design-normalize-radius";
export {
	type ElevationToken,
	normalizeElevation,
	normalizeSurfaces,
	type SurfaceToken,
} from "./design-normalize-surface";

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

// Collapses a uniform multi-value shorthand ("16px 16px 16px 16px") into its
// single canonical value. Mixed shorthands ("14px 20px") are kept raw: reducing
// them to one number would invent a measurement that was never taken.
export function canonicalSpacingValue(value: string): string {
	const parts = value.trim().split(/\s+/).filter(Boolean);
	if (parts.length < 2) return value;
	const first = parts[0] ?? "";
	if (parts.every((part) => part === first)) return first;
	return value;
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
	const classified = groupMeasurements(elements, [
		"padding",
		"margin",
		"gap",
		"max-width",
	])
		.map((group) => classifySpacingToken(group, elements, baseUnit))
		.map((token) => ({ ...token, value: canonicalSpacingValue(token.value) }));
	// Equivalent shorthands measured in different spellings describe one token,
	// so their frequencies merge instead of appearing as separate rows.
	const merged = new Map<string, SpacingToken>();
	for (const token of classified) {
		const key = `${token.property}\u0000${token.purpose}\u0000${token.value}`;
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, token);
			continue;
		}
		existing.frequency += token.frequency;
		for (const role of token.roles)
			if (!existing.roles.includes(role) && existing.roles.length < 6)
				existing.roles.push(role);
		for (const selector of token.selectors)
			if (
				!existing.selectors.includes(selector) &&
				existing.selectors.length < AUDIT_LIMIT
			)
				existing.selectors.push(selector);
	}
	const tokens = [...merged.values()]
		// A value measured on a single generic element is not yet a system token;
		// it is kept only when its context proves a purpose.
		// Zero measurements are CSS reset defaults, not design rhythm: they are
		// kept only when an action component was measured square on purpose.
		// Navigation and container zeros carry no spacing decision.
		.filter((token) => {
			if (token.valuePx === 0) return token.purpose === "Action padding";
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
