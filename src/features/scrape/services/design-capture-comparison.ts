import type { DesignComparison } from "../types/design-model";
import type { VisualEvidence } from "./design-visual-evidence";

export const SEMANTIC_PROPERTIES: Record<string, string> = {
	"background-color": "Background",
	"border-top-width": "Border width",
	"border-top-color": "Border color",
	"border-top-style": "Border style",
	margin: "Outer spacing",
	color: "Text color",
	"font-family": "Font family",
	"font-size": "Type size",
	"font-weight": "Weight",
	"line-height": "Line height",
	"letter-spacing": "Tracking",
	padding: "Internal spacing",
	gap: "Gap",
	"border-radius": "Corner radius",
	"max-width": "Maximum content width",
	display: "Layout mode",
	"grid-template-columns": "Grid tracks",
	"box-shadow": "Elevation",
};

export function compareCaptures(views: VisualEvidence[]): DesignComparison[] {
	const comparisons: DesignComparison[] = [];
	for (const [leftIndex, left] of views.entries()) {
		for (const [rightIndex, right] of views.entries()) {
			if (rightIndex <= leftIndex || left.sourceUrl !== right.sourceUrl)
				continue;
			const sameViewport =
				left.viewport.width === right.viewport.width &&
				left.viewport.height === right.viewport.height;
			const samePreference =
				(left.colorScheme ?? "auto") === (right.colorScheme ?? "auto");
			if (sameViewport === samePreference) continue;
			const kind = sameViewport ? "theme" : "responsive";
			for (const [elementIndex, element] of left.elements.entries()) {
				if (
					(!element.text.trim() &&
						element.role !== "canvas" &&
						!(element.role === "input" && element.elementId?.trim())) ||
					element.role === "element"
				)
					continue;
				if (!element.text.trim() && element.role === "input") {
					const id = element.elementId;
					if (
						left.elements.filter((entry) => entry.elementId === id).length !==
							1 ||
						right.elements.filter((entry) => entry.elementId === id).length !==
							1
					)
						continue;
				}
				// ponytail: exact selector and content only; match moved elements when stronger identity is available.
				const matches = right.elements.filter(
					(candidate) =>
						candidate.selector === element.selector &&
						candidate.role === element.role &&
						(element.role !== "input" ||
							!!element.text.trim() ||
							candidate.elementId === element.elementId) &&
						candidate.text === element.text,
				);
				if (matches.length !== 1) continue;
				const match = matches[0];
				if (!match) continue;
				for (const property of Object.keys(SEMANTIC_PROPERTIES)) {
					const a = element.properties[property]?.trim();
					const b = match.properties[property]?.trim();
					if (!a || !b || a === b) continue;
					const entry: DesignComparison = {
						kind,
						role: element.role,
						property,
						values: [
							{ capture: leftIndex + 1, value: a },
							{ capture: rightIndex + 1, value: b },
						],
						provenance: [
							{ capture: leftIndex + 1, element: elementIndex },
							{
								capture: rightIndex + 1,
								element: right.elements.indexOf(match),
							},
						],
						confidence: "observed",
					};
					const existing = comparisons.find(
						(candidate) =>
							candidate.kind === kind &&
							candidate.role === entry.role &&
							candidate.property === property &&
							JSON.stringify(candidate.values) === JSON.stringify(entry.values),
					);
					if (existing) existing.provenance.push(...entry.provenance);
					else comparisons.push(entry);
				}
			}
		}
	}
	return comparisons;
}
