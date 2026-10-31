import {
	type GroupedMeasurement,
	groupMeasurements,
	type VisualElementEvidence,
} from "../services/design-visual-evidence";
import { AUDIT_LIMIT, rolesFor } from "./design-shape-measure";

// Radius normalization. Radius values are meaningful by the component they
// round, so a 0px measured on hundreds of plain containers must not become the
// headline radius token.

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
	/**
	 * The capture this value was measured in, e.g. "capture 1: 1440x800, auto".
	 * A radius measured in two captures is two scoped facts, not one value.
	 */
	scope: string;
	/** True when the value came from elements that were not generic containers. */
	contextual: boolean;
	/**
	 * True only when every element in this context has a uniform pixel radius
	 * that rounds at least half its shortest side. Shorthands remain unclassified.
	 */
	pill: boolean;
}

// The capture a flattened selector belongs to. buildDesignModel prefixes every
// selector with the capture it came from, so the scope survives the merge.
const CAPTURE_PREFIX = /^\[capture ([^\]]+)\]/;

function scopeOf(selector: string): string {
	const match = selector.match(CAPTURE_PREFIX);
	return match?.[1] ? `capture ${match[1]}` : "";
}

export function classifyRadiusToken(
	group: GroupedMeasurement,
	elements: VisualElementEvidence[],
): RadiusToken {
	const matching = elements.filter(
		(element) =>
			element.properties["border-radius"] === group.value &&
			group.roles.includes(element.role),
	);
	const roles = rolesFor(matching, "border-radius", group.value);
	const scalar = group.value.trim();
	const valuePx = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?px$/.test(scalar)
		? Number(scalar.slice(0, -2))
		: scalar === "0"
			? 0
			: Number.NaN;
	const contextual =
		roles.some((role) => role !== "element") || group.frequency >= 2;
	const pill =
		Number.isFinite(valuePx) &&
		valuePx > 0 &&
		matching.length > 0 &&
		matching.every(
			(element) =>
				Number.isFinite(element.width) &&
				Number.isFinite(element.height) &&
				element.width > 0 &&
				element.height > 0 &&
				valuePx >= Math.min(element.width, element.height) / 2,
		);
	let purpose: RadiusPurpose = "Measured radius";
	if (roles.includes("cta")) purpose = "Buttons";
	else if (roles.includes("input")) purpose = "Inputs";
	else if (roles.includes("nav")) purpose = "Navigation";
	else if (roles.includes("card"))
		purpose =
			Number.isFinite(valuePx) && valuePx >= 16 ? "Large cards" : "Cards";
	else if (roles.includes("a") || roles.includes("img"))
		purpose = "Icons and tags";
	return {
		purpose,
		value: group.value,
		valuePx,
		frequency: group.frequency,
		roles: roles.slice(0, 6),
		selectors: group.selectors.slice(0, AUDIT_LIMIT),
		scope: scopeOf(group.selectors[0] ?? ""),
		contextual,
		pill,
	};
}

export function normalizeRadii(
	elements: VisualElementEvidence[],
): RadiusToken[] {
	const contexts = new Map<string, VisualElementEvidence[]>();
	for (const element of elements) {
		// buildDesignModel prefixes selectors when flattening separate captures.
		const scope = element.selector.match(/^\[capture [^\]]+\]/)?.[0] ?? "";
		const key = `${scope}\u0000${element.role}`;
		const context = contexts.get(key);
		if (context) context.push(element);
		else contexts.set(key, [element]);
	}
	const measured = [...contexts.values()]
		.flatMap((context) =>
			groupMeasurements(context, ["border-radius"]).map((group) =>
				classifyRadiusToken(group, context),
			),
		)
		.filter((token) => {
			if (!token.contextual) return false;
			// Zero rounding is the absence of a rounding decision, so it is not a
			// design token. It only survives when a real component class was measured
			// square on purpose, which the component section already states.
			if (token.valuePx === 0) return token.purpose !== "Measured radius";
			return true;
		});
	// Two element classes can resolve to the same component purpose at the same
	// value in the same capture. That is one component fact, not two tokens.
	const merged = new Map<string, RadiusToken>();
	for (const token of measured) {
		const key = [token.scope, token.purpose, token.value, token.pill].join(
			"\u0000",
		);
		const existing = merged.get(key);
		if (existing) {
			existing.frequency += token.frequency;
			existing.roles = [
				...new Set([...existing.roles, ...token.roles]),
			].slice(0, 6);
			existing.selectors = [
				...new Set([...existing.selectors, ...token.selectors]),
			].slice(0, AUDIT_LIMIT);
			continue;
		}
		merged.set(key, token);
	}
	return [...merged.values()].sort(
		(a, b) =>
			a.purpose.localeCompare(b.purpose) ||
			b.frequency - a.frequency ||
			(Number.isFinite(b.valuePx) ? b.valuePx : 0) -
				(Number.isFinite(a.valuePx) ? a.valuePx : 0),
	);
}

// Pill and fully-rounded shapes come from very large radii. The original value
// is preserved as provenance; the magnitude only informs the description.
export const PILL_RADIUS_PX = 120;

export function isPillRadius(valuePx: number): boolean {
	return Number.isFinite(valuePx) && valuePx >= PILL_RADIUS_PX;
}
