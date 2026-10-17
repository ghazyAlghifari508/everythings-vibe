import type { VisualElementEvidence } from "../services/design-visual-evidence";
import { type NormalizedColor, normalizeColor } from "./design-color-parse";

// Turns raw computed CSS into canonical, deduplicated palette tokens, keeping
// every token traceable back to the measurement that produced it.

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

// Values from a colour space the parser cannot reduce to sRGB. They are
// reported as evidence with a limitation instead of being guessed or silently
// dropped.
const UNSUPPORTED_COLOR_SPACE =
	/^(oklch|oklab|lch|lab|hwb|hsl|hsla|color|color-mix|light-dark)\(/i;

// Collects the distinct raw colour values the palette cannot represent, so
// callers can state the gap instead of dropping the measurement silently.
export function collectUnsupportedColors(
	elements: VisualElementEvidence[],
): string[] {
	const unsupported: string[] = [];
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
			if (!UNSUPPORTED_COLOR_SPACE.test(value.trim())) continue;
			if (normalizeColor(value) !== null) continue;
			if (!unsupported.includes(value)) unsupported.push(value);
		}
	}
	return unsupported;
}

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
