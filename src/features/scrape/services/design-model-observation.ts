import type { ModelComponent } from "@/features/scrape/types/design-model";
import { normalizeColor } from "../utils/design-color-parse";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "./design-visual-evidence";

export const RULE_FREQUENCY_MINIMUM = 2;

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
		section: "Layout containers",
		main: "Layout containers",
		header: "Header",
		footer: "Footer",
	};
	for (const [role, elements] of [...byRole.entries()].sort(
		(a, b) => b[1].length - a[1].length,
	)) {
		if (elements.length < RULE_FREQUENCY_MINIMUM) continue;
		const treatments = new Map<string, string[]>();
		for (const element of elements) {
			const properties = Object.entries(element.properties)
				.filter(([, value]) => value.trim())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([property, value]) => `${property}: ${value}`)
				.join("; ");
			if (!properties) continue;
			const selectors = treatments.get(properties) ?? [];
			selectors.push(element.selector);
			treatments.set(properties, selectors);
		}
		if (!treatments.size) continue;
		const name = roleLabel[role] ?? `Observed ${role}`;
		components.push({
			name,
			description:
				[...treatments]
					.map(
						([properties, selectors]) =>
							`Apply only to matching ${role} samples (${selectors.join(", ")}): ${properties}.`,
					)
					.join("\n") +
				" Missing properties, interaction states and primary/secondary hierarchy are not established; do not generalize across treatments or captures.",
			evidence: `Measured on ${elements.length} ${role} elements in the capture samples: ${elements.map((element) => element.selector).join(", ")}. Semantic role inferred from DOM.`,
			frequency: elements.length,
			roles: [role],
		});
		if (components.length >= 8) break;
	}
	return components;
}
