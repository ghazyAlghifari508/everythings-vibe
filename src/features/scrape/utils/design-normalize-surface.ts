import {
	groupMeasurements,
	type VisualElementEvidence,
} from "../services/design-visual-evidence";
import { normalizeColor } from "./design-color-parse";
import { AUDIT_LIMIT, rolesFor } from "./design-shape-measure";

// Elevation and surface normalization. Shadows describe measured layers, and
// surfaces are the background colours that cover large areas.

export interface ElevationToken {
	value: string;
	frequency: number;
	roles: string[];
	selectors: string[];
	/** How many distinct elements carried this exact shadow. */
	usageNote: string;
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
