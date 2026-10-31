import type { DesignTokenModel } from "../services/design-model";
import { buildTokenDeclarations, propertyBlocks } from "./design-md-css";
import {
	type ScopedDeclaration,
	scopedStylesheet,
} from "./design-md-css-scopes";
import { codeFence, escapeCell, heading } from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";

// Agent prompt guide and the two generated stylesheet outputs (Agent Prompt Guide, CSS Custom Properties, Tailwind v4).

export function renderAgentPromptGuide(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	// Only a colour that was actually measured as an action fill can describe an
	// action. A brand-named colour used for body text proves brand association,
	// not an action hierarchy.
	const primaryActionColor = model.colors.find(
		(color) => color.role === "Primary action",
	);
	const actionFillColor = model.colors.find(
		(color) => color.role === "Action accent",
	);
	const textColor =
		model.colors.find((color) => color.role === "Base text") ??
		model.colors.find((color) => color.role === "Text");
	const surfaceColor = model.surfaces[0];
	lines.push("", heading(2, "Agent Prompt Guide"));
	lines.push("", "**Quick reference**");
	lines.push(
		`- text: ${textColor ? `\`${textColor.value}\`` : "not measured"}`,
		`- surface: ${surfaceColor ? `\`${surfaceColor.value}\`` : "not measured"}`,
		`- action fill: ${
			actionFillColor ? `\`${actionFillColor.value}\`` : "not measured"
		}`,
		`- primary action: ${
			primaryActionColor ? `\`${primaryActionColor.value}\`` : "not measured"
		}`,
		`- base spacing unit: ${Number.isFinite(model.baseUnitPx) ? `${model.baseUnitPx}px` : "not measured"}`,
	);
	if (options.implementationGuidance?.length) {
		lines.push("", "**Implementation guidance**");
		for (const note of options.implementationGuidance)
			lines.push(`- ${escapeCell(note)}`);
	}
	lines.push(
		"",
		"Use the observed values exactly as written. Inferred roles describe measured usage and must not be promoted to measurements. If a new requirement is not covered here, treat it as a new product decision rather than an extraction result.",
		"This is an internal styling reference, not product content or permission to copy the source site's structure, logos or proprietary assets. Do not add palette galleries, token inspectors or documentation sections unless the product requirements explicitly request them.",
		"Preserve each applicable component's measured radius; never substitute a global radius for buttons, inputs or cards. This document is a design specification, not a request for a design-system showcase. Build the user's application, not Color Palette, Typography Specimen or UI Documentation pages.",
		"Map component measurements to existing components before editing. Preserve content and flows. After editing, report each applicable rule with its code location and token/value mapping, or explain why it remains unknown or unapplied. Do not claim a perfect visual match from limited captures.",
	);
}

const CSS_INTRO =
	"Generated from validated measurements. These are implementation aliases derived from the capture, not declarations copied from the website's own stylesheet.";

function renderCssSection(lines: string[], sheet: string | null): void {
	if (!sheet) return;
	lines.push(
		"",
		heading(2, "CSS Custom Properties"),
		"",
		CSS_INTRO,
		"",
		codeFence("css", sheet),
	);
}

function renderTailwindSection(lines: string[], sheet: string | null): void {
	if (!sheet) return;
	lines.push("", heading(2, "Tailwind v4"), "", codeFence("css", sheet));
}

function tailwindNote(scoped: boolean): string[] {
	return scoped
		? [
				"",
				"Scope blocks override the theme variables under the measured condition; they are endpoint observations, not the website's original breakpoints.",
			]
		: [];
}

// Single capture: one stylesheet per output format.
export function renderCodeSections(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	const codeReference = model.settings?.codeReference ?? "both";
	renderAgentPromptGuide(lines, model, options);
	const declarations = buildTokenDeclarations(model);
	const blocks = propertyBlocks([
		["Colors", declarations.color],
		["Font families", declarations.font],
		["Type scale", declarations.type],
		["Spacing", declarations.spacing],
		["Container", declarations.container],
		["Radius", declarations.radius],
	]);
	const hasBlocks = blocks.length > 0;
	if (codeReference !== "tailwind-v4")
		renderCssSection(
			lines,
			hasBlocks ? [":root {", ...blocks].join("\n\n") + "\n}" : null,
		);
	if (codeReference !== "css")
		renderTailwindSection(
			lines,
			hasBlocks ? ["@theme {", ...blocks].join("\n\n") + "\n}" : null,
		);
}

// Multiple captures: shared tokens are declared once, and each other capture
// contributes only its measured overrides inside its own condition.
export function renderScopedCodeSections(
	lines: string[],
	base: DesignTokenModel,
	scopes: ScopedDeclaration[],
	options: RenderDesignMdOptions,
): void {
	const codeReference = base.settings?.codeReference ?? "both";
	renderAgentPromptGuide(lines, base, options);
	if (codeReference !== "tailwind-v4")
		renderCssSection(lines, scopedStylesheet(base, scopes, "root"));
	const tailwind = scopedStylesheet(base, scopes, "theme");
	if (codeReference !== "css") {
		renderTailwindSection(lines, tailwind);
		if (tailwind) lines.push(...tailwindNote(scopes.length > 0));
	}
}
