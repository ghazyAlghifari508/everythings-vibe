import type { VisualElementEvidence } from "../services/design-visual-evidence";
import { parsePx } from "./design-normalize-typography";

// Shared measurement helpers for spacing, radius, elevation and surface
// normalization.

export const AUDIT_LIMIT = 3;

export function pxOf(value: string): number {
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

export function rolesFor(
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
