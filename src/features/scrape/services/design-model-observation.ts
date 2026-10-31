import type {
	ModelComponent,
	ModelComponentCharacteristic,
	ModelComponentTreatment,
} from "@/features/scrape/types/design-model";
import { normalizeColor } from "../utils/design-color-parse";
import {
	parsePx,
	primaryFontFamily,
} from "../utils/design-normalize-typography";
import { SEMANTIC_PROPERTIES } from "./design-capture-comparison";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "./design-visual-evidence";

export const RULE_FREQUENCY_MINIMUM = 2;

// Representative selectors kept per treatment. The full element list stays in
// the capture; the document only needs enough samples to identify the
// treatment without growing the payload with every repeated element.
const TREATMENT_SELECTOR_LIMIT = 3;
// Upper bound on the treatments one component describes, so a page with many
// measured variants cannot produce an unbounded component section.
export const TREATMENT_LIMIT = 6;

// CSS defaults that carry no implementation instruction. They are dropped from
// the component specification, never from the raw capture.
const DEFAULT_VALUES: Record<string, string[]> = {
	"background-image": ["none"],
	"box-shadow": ["none"],
	"border-top-style": ["none"],
	"grid-template-columns": ["none"],
	"max-width": ["none"],
	"letter-spacing": ["normal"],
	"line-height": ["normal"],
	display: ["block", "inline"],
};

const WEIGHT_NAMES: Record<string, string> = {
	"100": "thin",
	"200": "extralight",
	"300": "light",
	"400": "normal",
	"500": "medium",
	"600": "semibold",
	"700": "bold",
	"800": "extrabold",
	"900": "black",
};

function isTransparent(value: string): boolean {
	return (
		value === "transparent" ||
		/rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value) ||
		/^#(?:[0-9a-f]{2}){3}00$/i.test(value)
	);
}

function weightLabel(weight: string): string {
	return WEIGHT_NAMES[weight] ?? weight;
}

// Reduces a measured property bag to the values a design-system consumer can
// act on. Identical measurements collapse because the caller groups by the
// curated bag, and no-op defaults never reach the specification.
export function curateComponentProperties(
	properties: Record<string, string>,
): Record<string, string> {
	const borderWidth = parsePx(properties["border-top-width"] ?? "");
	const borderStyle = properties["border-top-style"] ?? "";
	const hasBorder =
		borderWidth > 0 && borderStyle !== "" && borderStyle !== "none";
	const curated: Record<string, string> = {};
	for (const [property, raw] of Object.entries(properties)) {
		if (!(property in SEMANTIC_PROPERTIES)) continue;
		const value = raw.replace(/\s+/g, " ").trim();
		if (!value) continue;
		if (DEFAULT_VALUES[property]?.includes(value)) continue;
		if (property.startsWith("border-top-") && !hasBorder) continue;
		if (
			(property === "background-color" || property === "color") &&
			isTransparent(value)
		)
			continue;
		curated[property] = value;
	}
	return curated;
}

// Turns curated properties into the ordered, human-readable characteristics a
// reader can apply directly. Measured values only; nothing is inferred here.
export function describeComponentProperties(
	properties: Record<string, string>,
	elements: VisualElementEvidence[] = [],
): ModelComponentCharacteristic[] {
	const characteristics: ModelComponentCharacteristic[] = [];
	const push = (label: string, value: string) => {
		if (value.trim()) characteristics.push({ label, value: value.trim() });
	};
	const fontFamily = properties["font-family"];
	const fontWeight = properties["font-weight"];
	const fontParts = [
		fontFamily ? primaryFontFamily(fontFamily) : "",
		properties["font-size"] ?? "",
		fontWeight ? weightLabel(fontWeight) : "",
	].filter(Boolean);
	push("Typography", fontParts.join(" · "));
	push("Line height", properties["line-height"] ?? "");
	push("Tracking", properties["letter-spacing"] ?? "");
	push("Layout", properties.display ?? "");
	push("Grid tracks", properties["grid-template-columns"] ?? "");
	push("Background", properties["background-color"] ?? "");
	push("Text color", properties.color ?? "");
	if (properties["border-top-width"]) {
		const border = [
			properties["border-top-width"],
			properties["border-top-style"] ?? "",
			properties["border-top-color"] ?? "",
		]
			.filter(Boolean)
			.join(" ");
		push("Border", border);
	}
	const radius = properties["border-radius"];
	if (radius) {
		const scalar = radius.trim();
		const value = /^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(scalar)
			? Number(scalar.slice(0, -2))
			: 0;
		const pill =
			value > 0 &&
			elements.length > 0 &&
			elements.every(
				(element) =>
					Number.isFinite(element.width) &&
					Number.isFinite(element.height) &&
					element.width > 0 &&
					element.height > 0 &&
					value >= Math.min(element.width, element.height) / 2,
			);
		push("Corner radius", pill ? `${radius} (pill)` : radius);
	}
	push("Padding", properties.padding ?? "");
	push("Gap", properties.gap ?? "");
	push("Margin", properties.margin ?? "");
	push("Maximum content width", properties["max-width"] ?? "");
	push("Elevation", properties["box-shadow"] ?? "");
	return characteristics;
}

function sharedCharacteristics(
	treatments: { characteristics: ModelComponentCharacteristic[] }[],
): ModelComponentCharacteristic[] {
	const [first, ...rest] = treatments;
	if (!first) return [];
	return first.characteristics.filter((entry) =>
		rest.every((treatment) =>
			treatment.characteristics.some(
				(candidate) =>
					candidate.label === entry.label && candidate.value === entry.value,
			),
		),
	);
}

// Non-canvas backgrounds cannot establish the page's overall appearance.
export function inferTheme(
	evidence: VisualEvidence,
): "light" | "dark" | "unknown" {
	const canvas = evidence.elements.filter(
		(element) =>
			element.role === "canvas" && element.properties["background-color"],
	);
	for (const element of canvas) {
		const normalized = normalizeColor(
			element.properties["background-color"] ?? "",
		);
		if (!normalized || normalized.isNoOp || normalized.hasAlpha) continue;
		const luminance =
			(0.2126 * normalized.r + 0.7152 * normalized.g + 0.0722 * normalized.b) /
			255;
		if (luminance >= 0.6) return "light";
		if (luminance <= 0.4) return "dark";
		return "unknown";
	}
	return "unknown";
}

export function deriveObservedComponents(
	evidence: VisualEvidence,
): ModelComponent[] {
	const components: ModelComponent[] = [];
	const byRole = new Map<string, VisualElementEvidence[]>();
	for (const element of evidence.elements) {
		if (element.role === "element" || element.role === "canvas") continue;
		const group = byRole.get(element.role) ?? [];
		group.push(element);
		byRole.set(element.role, group);
	}
	const roleLabel: Record<string, string> = {
		nav: "Navigation",
		h1: "Hero heading",
		h2: "Section heading",
		h3: "Subheading",
		body: "Body copy",
		cta: "Buttons and CTAs",
		input: "Inputs",
		card: "Cards",
		section: "Page sections",
		main: "Main content area",
		header: "Header",
		footer: "Footer",
	};
	const rolePurpose: Record<string, string> = {
		nav: "Primary site navigation.",
		h1: "Lead hero heading.",
		h2: "Section heading.",
		h3: "Subheading within a section.",
		body: "Body copy.",
		cta: "Action controls, such as buttons and calls to action.",
		input: "Form input controls.",
		card: "Content cards.",
		section: "Page section container.",
		main: "Main content area.",
		header: "Page header.",
		footer: "Page footer.",
	};
	for (const [role, elements] of [...byRole.entries()].sort(
		(a, b) => b[1].length - a[1].length,
	)) {
		// Elements with an identical curated treatment are one measured variant,
		// not one variant per DOM node.
		const treatments = new Map<string, VisualElementEvidence[]>();
		for (const element of elements) {
			const curated = curateComponentProperties(element.properties);
			const properties = Object.entries(curated)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([property, value]) => `${property}: ${value}`)
				.join("; ");
			if (!properties) continue;
			const group = treatments.get(properties) ?? [];
			group.push(element);
			treatments.set(properties, group);
		}
		if (!treatments.size) continue;
		// Two roles can share a label, so the name is disambiguated before it
		// reaches the document: duplicate headings and duplicate keys make a
		// component list ambiguous.
		const baseName = roleLabel[role] ?? `Observed ${role}`;
		let name = baseName;
		for (let suffix = 2; components.some((c) => c.name === name); suffix++)
			name = `${baseName} ${suffix}`;
		// Variants are ordered by measured support. No primary/secondary
		// hierarchy is claimed because frequency does not establish one.
		const variants: ModelComponentTreatment[] = [...treatments]
			.sort((a, b) => b[1].length - a[1].length)
			.slice(0, TREATMENT_LIMIT)
			.map(([, group], index) => {
				const sample = group[0];
				const curated = sample
					? curateComponentProperties(sample.properties)
					: {};
				return {
					label: `Variant ${index + 1}`,
					properties: curated,
					characteristics: describeComponentProperties(curated, group),
					width: sample?.width ?? 0,
					height: sample?.height ?? 0,
					samples: group.length,
					selectors: group
						.slice(0, TREATMENT_SELECTOR_LIMIT)
						.map((element) => element.selector),
				};
			});
		const shared = sharedCharacteristics(variants);
		for (const variant of variants) {
			variant.characteristics = variant.characteristics.filter(
				(entry) =>
					!shared.some(
						(candidate) =>
							candidate.label === entry.label &&
							candidate.value === entry.value,
					),
			);
		}
		const repeated = elements.length >= RULE_FREQUENCY_MINIMUM;
		components.push({
			treatments: variants,
			name,
			purpose: rolePurpose[role] ?? `Observed ${role} element.`,
			sharedCharacteristics: shared,
			description: repeated
				? "Unseen variants, interaction states, and intermediate breakpoints are not established by this capture."
				: "This is a single measured observation, not a repeated pattern; it applies to the cited sample only and supports no shared rule.",
			evidence: `Measured on ${elements.length} ${role} element${elements.length === 1 ? "" : "s"} in this capture; ${treatments.size} distinct measured treatment${treatments.size === 1 ? "" : "s"}. Role inferred from DOM; source selectors are retained in the capture evidence.`,
			frequency: elements.length,
			roles: [role],
			treatmentCount: treatments.size,
			guidance: [
				repeated
					? "Apply these measured values only to components that match this class and capture scope."
					: "Apply this recipe only to the measured sample; do not treat it as a shared rule.",
				"Do not copy the reference site's text, links, images, or brand assets as product content.",
			],
		});
		if (components.length >= 8) break;
	}
	return components;
}
