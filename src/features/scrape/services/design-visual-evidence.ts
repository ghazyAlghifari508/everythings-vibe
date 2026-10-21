import type { DesignSettings } from "@/features/scrape/types/scrape-contract";
import {
	DESIGN_EVIDENCE_LIMITS,
	type DesignEvidenceLimits,
} from "../types/design-evidence-contract";

// The measured evidence contract and its DOM capture. Extraction, grouping,
// guidance and rendering live in their own modules; their public names stay
// reachable from here because consumers import them from this path.

export { extractionFromVisualEvidence } from "./design-evidence-extraction";
export { groupMeasurements } from "./design-evidence-grouping";
export { deriveEvidenceGuidelines } from "./design-evidence-guidelines";
export { renderEvidenceDesignMd } from "./design-evidence-render";

export interface VisualElementEvidence {
	selector: string;
	role: string;
	text: string;
	width: number;
	height: number;
	properties: Record<string, string>;
	variables?: Record<string, string>;
}

export interface VisualEvidence {
	version: 1;
	sourceUrl: string;
	capturedAt: string;
	viewport: { width: number; height: number };
	elements: VisualElementEvidence[];
	fonts: { family: string; weight: string; status: string }[];
	limitations: string[];
	colorScheme?: "auto" | "light" | "dark";
	settings?: DesignSettings;
	additionalViews?: Omit<VisualEvidence, "settings" | "additionalViews">[];
}

export interface GroupedMeasurement {
	property: string;
	value: string;
	// How many distinct visible elements produced this exact property/value pair.
	frequency: number;
	// Selectors kept for audit; the first entry is the representative sample.
	selectors: string[];
	roles: string[];
}

export interface EvidenceGuidelines {
	dos: string[];
	donts: string[];
	// Stated when the capture cannot support a recommendation, so the document
	// explains the gap instead of shipping generic advice.
	limitations: string[];
}

export function collectVisualEvidence(
	limits: DesignEvidenceLimits = DESIGN_EVIDENCE_LIMITS,
): VisualEvidence {
	const elements: VisualElementEvidence[] = [];
	const walker = document.createTreeWalker(
		document.documentElement,
		NodeFilter.SHOW_ELEMENT,
	);
	let scanned = 0;
	const properties = [
		"background-color",
		"background-image",
		"color",
		"border-top-color",
		"border-top-width",
		"border-top-style",
		"font-family",
		"font-size",
		"font-weight",
		"line-height",
		"letter-spacing",
		"font-style",
		"text-transform",
		"padding",
		"margin",
		"gap",
		"border-radius",
		"box-shadow",
		"max-width",
		"display",
	];
	const candidates: HTMLElement[] = [];
	if (document.documentElement instanceof HTMLElement)
		candidates.push(document.documentElement);
	while (walker.nextNode() && scanned < limits.scanElements) {
		scanned += 1;
		if (walker.currentNode instanceof HTMLElement)
			candidates.push(walker.currentNode);
	}
	candidates.sort(
		(a, b) =>
			Number(
				b.matches(
					"body, header, nav, main, h1, h2, h3, p, button, a, input, select, textarea, section, footer",
				),
			) -
			Number(
				a.matches(
					"body, header, nav, main, h1, h2, h3, p, button, a, input, select, textarea, section, footer",
				),
			),
	);
	for (const element of candidates) {
		if (elements.length >= limits.elements) break;
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		if (
			!rect.width ||
			!rect.height ||
			style.visibility !== "visible" ||
			style.display === "none" ||
			Number(style.opacity) === 0 ||
			element.closest("[hidden], [inert], [aria-hidden='true']")
		)
			continue;
		let ancestor = element.parentElement;
		let hidden = false;
		while (ancestor) {
			const parentStyle = getComputedStyle(ancestor);
			if (
				Number(parentStyle.opacity) === 0 ||
				parentStyle.visibility !== "visible"
			) {
				hidden = true;
				break;
			}
			ancestor = ancestor.parentElement;
		}
		if (hidden) continue;
		const tag = element.tagName.toLowerCase();
		const role = element.matches("input, select, textarea")
			? "input"
			: element.matches(
						"button, [role='button'], a[class*='button'], a[class*='btn'], a[class*='cta']",
					)
				? "cta"
				: element.closest("nav")
					? "nav"
					: /^h[1-6]$/.test(tag)
						? tag
						: tag === "body" || tag === "html"
							? "canvas"
							: tag === "p"
								? "body"
								: element.matches("header, main, section, article, footer")
									? tag
									: "element";
		const values: Record<string, string> = {};
		for (const property of properties)
			values[property] = style
				.getPropertyValue(property)
				.trim()
				.slice(0, limits.valueChars);
		const variables: Record<string, string> = {};
		for (const property of Array.from(style)) {
			if (Object.keys(variables).length >= limits.variables) break;
			if (/^--[\w-]+$/.test(property))
				variables[property] = style
					.getPropertyValue(property)
					.trim()
					.slice(0, limits.valueChars);
		}
		const path: string[] = [];
		let current: Element | null = element;
		while (current && path.join(" > ").length < limits.selectorChars - 100) {
			const siblings = current.parentElement
				? Array.from(current.parentElement.children)
				: [current];
			path.unshift(
				`${current.tagName.toLowerCase()}:nth-child(${siblings.indexOf(current) + 1})`,
			);
			current = current.parentElement;
		}
		elements.push({
			selector: path.join(" > "),
			role,
			text: (element.innerText ?? "").replace(/\s+/g, " ").slice(0, 120),
			width: rect.width,
			height: rect.height,
			properties: values,
			variables,
		});
	}
	return {
		version: 1,
		sourceUrl: location.href,
		capturedAt: new Date().toISOString(),
		viewport: { width: innerWidth, height: innerHeight },
		elements,
		fonts: Array.from(document.fonts)
			.slice(0, limits.fonts)
			.map((font) => ({
				family: font.family,
				weight: font.weight,
				status: font.status,
			})),
		limitations: [
			"Only selected viewport sizes are measured; intermediate widths and interaction states are not verified.",
			"Computed font-family is a stack; selected glyph font is not verified.",
			"Pseudo-elements, third-party overlays and glyph-level font selection are not verified.",
			...(scanned >= limits.scanElements || elements.length >= limits.elements
				? ["DOM sampling limit reached."]
				: []),
		],
	};
}
