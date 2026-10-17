import type {
	GroupedMeasurement,
	VisualElementEvidence,
} from "./design-visual-evidence";

// Collapses identical property/value measurements into one curated entry so the
// document describes a design system instead of dumping per-element CSS. Raw
// provenance stays available through frequency, selectors and roles.

const AUDIT_SELECTOR_LIMIT = 3;
const AUDIT_ROLE_LIMIT = 3;

export function groupMeasurements(
	elements: VisualElementEvidence[],
	properties: string[],
): GroupedMeasurement[] {
	const groups = new Map<string, GroupedMeasurement>();
	for (const element of elements) {
		for (const property of properties) {
			const value = element.properties[property];
			if (!value || value === "none" || value === "normal") continue;
			const key = `${property}\u0000${value}`;
			const existing = groups.get(key);
			if (existing) {
				existing.frequency += 1;
				if (
					existing.selectors.length < AUDIT_SELECTOR_LIMIT &&
					!existing.selectors.includes(element.selector)
				)
					existing.selectors.push(element.selector);
				if (
					existing.roles.length < AUDIT_ROLE_LIMIT &&
					!existing.roles.includes(element.role)
				)
					existing.roles.push(element.role);
				continue;
			}
			groups.set(key, {
				property,
				value,
				frequency: 1,
				selectors: [element.selector],
				roles: [element.role],
			});
		}
	}
	return [...groups.values()].sort(
		(a, b) =>
			b.frequency - a.frequency ||
			a.property.localeCompare(b.property) ||
			a.value.localeCompare(b.value),
	);
}
