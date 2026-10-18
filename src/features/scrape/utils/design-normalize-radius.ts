import {
	type GroupedMeasurement,
	groupMeasurements,
	type VisualElementEvidence,
} from "../services/design-visual-evidence";
import { AUDIT_LIMIT, pxOf, rolesFor } from "./design-shape-measure";

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
	/** True when the value came from elements that were not generic containers. */
	contextual: boolean;
	/**
	 * True when the radius covers at least half of the smallest measured side
	 * of the elements that carry it, so the corners meet and the shape reads
	 * as fully rounded. Judged from element geometry, never from a fixed pixel
	 * threshold alone. The raw measured value is always preserved.
	 */
	pill: boolean;
}

export function classifyRadiusToken(
	group: GroupedMeasurement,
	elements: VisualElementEvidence[],
): RadiusToken {
	const roles = rolesFor(elements, "border-radius", group.value);
	const valuePx = pxOf(group.value);
	const contextual =
		roles.some((role) => role !== "element") || group.frequency >= 2;
	// A radius at least half of the smallest measured side rounds the corners
	// into each other, so the element reads as fully rounded regardless of how
	// large the raw pixel number is.
	const smallestSide = elements
		.filter((element) => element.properties["border-radius"] === group.value)
		.map((element) => Math.min(element.width, element.height))
		.filter((side) => Number.isFinite(side) && side > 0);
	const shortest = smallestSide.length ? Math.min(...smallestSide) : NaN;
	const pill =
		Number.isFinite(valuePx) &&
		valuePx > 0 &&
		Number.isFinite(shortest) &&
		valuePx >= shortest / 2;
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
		pill,
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

// Pill and fully-rounded shapes come from very large radii. The original value
// is preserved as provenance; the magnitude only informs the description.
export const PILL_RADIUS_PX = 120;

export function isPillRadius(valuePx: number): boolean {
	return Number.isFinite(valuePx) && valuePx >= PILL_RADIUS_PX;
}
