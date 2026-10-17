import type { ModelComponent } from "@/features/scrape/types/design-model";
import { normalizeColor } from "../utils/design-color-parse";
import type { VisualEvidence } from "./design-visual-evidence";

// Deterministic observations taken from the capture. Nothing here is inferred
// from a single sighting, and nothing is guessed when the evidence is missing.

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

// Deterministic component patterns observed in the capture. Only roles seen at
// least twice become patterns, and every pattern cites measured frequency and
// roles so it is evidence-grounded without AI.
export function deriveObservedComponents(
	evidence: VisualEvidence,
): ModelComponent[] {
	const components: ModelComponent[] = [];
	const byRole = new Map<string, number>();
	for (const element of evidence.elements) {
		if (element.role === "element" || element.role === "canvas") continue;
		byRole.set(element.role, (byRole.get(element.role) ?? 0) + 1);
	}
	const roleLabel: Record<string, string> = {
		nav: "Navigation",
		h1: "Hero heading",
		h2: "Section heading",
		h3: "Subheading",
		body: "Body copy",
		cta: "Buttons and CTAs",
		section: "Layout containers",
		main: "Layout containers",
		header: "Header",
		footer: "Footer",
	};
	for (const [role, frequency] of [...byRole.entries()].sort(
		(a, b) => b[1] - a[1],
	)) {
		if (frequency < RULE_FREQUENCY_MINIMUM) continue;
		const name = roleLabel[role] ?? `Observed ${role}`;
		components.push({
			name,
			description: `Observed ${frequency} ${role} elements in the captured viewport with consistent measured styling.`,
			evidence: `Measured on ${frequency} ${role} elements.`,
			frequency,
			roles: [role],
		});
		if (components.length >= 8) break;
	}
	return components;
}
