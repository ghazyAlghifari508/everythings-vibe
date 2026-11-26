import type { DesignTokenModel } from "../services/design-model";
import { buildTokenDeclarations, propertyBlocks } from "./design-md-css";
import {
	type ScopedDeclaration,
	scopedStylesheet,
} from "./design-md-css-scopes";
import { codeFence, heading } from "./design-md-markdown";

// The two generated stylesheet outputs. The implementation brief is rendered
// separately, before the measurement tables, so neither output repeats it.

const CSS_INTRO =
	"Generated from validated measurements. These are implementation aliases derived from the capture, not declarations copied from the website's own stylesheet. A role name comes from a usage the capture proved; a `measured` name marks a value whose role the capture could not establish, and browser-default colours are listed as evidence only.";

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
): void {
	const codeReference = model.settings?.codeReference ?? "both";
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
): void {
	const codeReference = base.settings?.codeReference ?? "both";
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
