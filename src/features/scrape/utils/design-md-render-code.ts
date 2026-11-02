import type { DesignTokenModel } from "../services/design-model";
import { buildTokenDeclarations, propertyBlocks } from "./design-md-css";
import {
	type ScopedDeclaration,
	scopedStylesheet,
} from "./design-md-css-scopes";
import { codeFence, escapeCell, heading } from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";

// The AI agent guide and the two generated stylesheet outputs (AI Agent
// Implementation Guide, CSS / Tailwind Reference).

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
	lines.push("", heading(2, "AI Agent Implementation Guide"));
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

	lines.push(
		"",
		"**Operational Guidelines**",
		"1. **Understand the product first:** decide what the application must do before styling it.",
		"2. **Treat this document as a style reference:** it describes visual language, not features or content.",
		"3. **Map styles to existing components:** reuse the application's own component classes instead of inventing equivalents.",
		"4. **Preserve hierarchy and semantic roles:** keep the measured role of each colour and type step; never promote an inferred role to a measurement.",
		"5. **Apply only proven responsive differences:** use the values recorded for desktop and mobile, and treat the endpoint widths as observations, not breakpoints.",
		"6. **Invent no unseen variants:** hover, focus, disabled and intermediate breakpoints were not captured unless stated.",
		"7. **Copy no proprietary assets:** do not reuse the source site's text, logos, images or brand assets as product content.",
		"8. **Build the product, not a design showcase:** no palette galleries, token inspectors or design-documentation pages unless the user asks for them.",
		"9. **Report what this document cannot establish:** treat an uncovered requirement as a new product decision and say it is unknown.",
	);

	if (options.implementationGuidance?.length) {
		lines.push("", "**Additional Guidance**");
		for (const note of options.implementationGuidance)
			lines.push(`- ${escapeCell(note)}`);
	}
}

const CSS_INTRO =
	"Generated from validated measurements. These are implementation aliases derived from the capture, not declarations copied from the website's own stylesheet.";

function renderCssSection(lines: string[], sheet: string | null): void {
	if (!sheet) return;
	lines.push(
		"",
		heading(3, "CSS Custom Properties"),
		"",
		CSS_INTRO,
		"",
		codeFence("css", sheet),
	);
}

function renderTailwindSection(lines: string[], sheet: string | null): void {
	if (!sheet) return;
	lines.push("", heading(3, "Tailwind v4"), "", codeFence("css", sheet));
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
	const cssSheet =
		codeReference !== "tailwind-v4" && hasBlocks
			? `${[":root {", ...blocks].join("\n\n")}\n}`
			: null;
	const tailwindSheet =
		codeReference !== "css" && hasBlocks
			? `${["@theme {", ...blocks].join("\n\n")}\n}`
			: null;
	renderCodeReference(lines, cssSheet, tailwindSheet);
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
	const cssSheet =
		codeReference !== "tailwind-v4"
			? scopedStylesheet(base, scopes, "root")
			: null;
	const tailwindSheet =
		codeReference !== "css" ? scopedStylesheet(base, scopes, "theme") : null;
	renderCodeReference(lines, cssSheet, tailwindSheet, scopes.length > 0);
}

// One wrapper section so CSS and Tailwind never appear as separate top-level
// sections, and an omitted format leaves no empty heading behind.
function renderCodeReference(
	lines: string[],
	cssSheet: string | null,
	tailwindSheet: string | null,
	scoped = false,
): void {
	if (!cssSheet && !tailwindSheet) return;
	lines.push("", heading(2, "CSS / Tailwind Reference"));
	renderCssSection(lines, cssSheet);
	renderTailwindSection(lines, tailwindSheet);
	if (tailwindSheet) lines.push(...tailwindNote(scoped));
}
