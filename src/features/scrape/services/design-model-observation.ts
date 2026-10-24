import type { ModelComponent } from "@/features/scrape/types/design-model";
import { normalizeColor } from "../utils/design-color-parse";
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

// Infers light/dark from the measured background luminance. A transparent
// canvas contributes nothing visible, so transparent and unparsable paints are
// skipped until the first opaque background: canvas first, then the remaining
// elements in capture order. Returns unknown when no opaque background was
// measured, so callers never present a guessed theme as measured.
export function inferTheme(
	evidence: VisualEvidence,
): "light" | "dark" | "unknown" {
	const canvas = evidence.elements.filter(
		(element) =>
			element.role === "canvas" && element.properties["background-color"],
	);
	const rest = evidence.elements.filter(
		(element) =>
			element.role !== "canvas" && element.properties["background-color"],
	);
	for (const element of [...canvas, ...rest]) {
		const normalized = normalizeColor(
			element.properties["background-color"] ?? "",
		);
		if (!normalized || normalized.isNoOp) continue;
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
	for (const [role, elements] of [...byRole.entries()].sort(
		(a, b) => b[1].length - a[1].length,
	)) {
		// A component class needs repeated support before it can be treated as a
		// pattern. A single fully measured sample is still real evidence for that
		// one element, so it is kept as a scoped observation instead of a
		// repeated pattern.
		const repeated = elements.length >= RULE_FREQUENCY_MINIMUM;
		const treatments = new Map<string, string[]>();
		for (const element of elements) {
			const properties = Object.entries(element.properties)
				.filter(
					([property, value]) =>
						property in SEMANTIC_PROPERTIES &&
						value.trim() &&
						value !== "none" &&
						value !== "normal",
				)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([property, value]) => `${property}: ${value}`)
				.join("; ");
			if (!properties) continue;
			const selectors = treatments.get(properties) ?? [];
			selectors.push(element.selector);
			treatments.set(properties, selectors);
		}
		if (!treatments.size) continue;
		// Two roles can share a label, so the name is disambiguated before it
		// reaches the document: duplicate headings and duplicate keys make a
		// component list ambiguous.
		const baseName = roleLabel[role] ?? `Observed ${role}`;
		let name = baseName;
		for (let suffix = 2; components.some((c) => c.name === name); suffix++)
			name = `${baseName} ${suffix}`;
		const scope = repeated
			? ""
			: " This is a single measured observation, not a repeated pattern; it applies to the cited sample only and supports no shared rule.";
		components.push({
			treatments: [...treatments]
				.slice(0, TREATMENT_LIMIT)
				.map(([, selectors]) => {
					const sample = elements.find(
						(element) => element.selector === selectors[0],
					);
					return {
						properties: Object.fromEntries(
							Object.entries(sample?.properties ?? {}).filter(
								([property, value]) =>
									property in SEMANTIC_PROPERTIES &&
									value.trim() &&
									value !== "none" &&
									value !== "normal",
							),
						),
						width: sample?.width ?? 0,
						height: sample?.height ?? 0,
						samples: selectors.length,
						selectors,
					};
				}),
			name,
			description:
				[...treatments]
					.slice(0, TREATMENT_LIMIT)
					.map(
						([properties, selectors]) =>
							`Measured ${role} treatment (${selectors.length} samples): ${properties}.`,
					)
					.join("\n") +
				` Missing properties, interaction states and primary/secondary hierarchy are not established; do not generalize across treatments or captures.${scope}`,
			evidence: `Measured on ${elements.length} ${role} element${elements.length === 1 ? "" : "s"} in the capture samples: ${elements
				.slice(0, TREATMENT_SELECTOR_LIMIT)
				.map((element) => element.selector)
				.join(", ")}. Semantic role inferred from DOM.`,
			frequency: elements.length,
			roles: [role],
			treatmentCount: treatments.size,
		});
		if (components.length >= 8) break;
	}
	return components;
}
