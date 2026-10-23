import type { DesignTokenModel } from "../services/design-model";
import { buildTokenDeclarations, propertyBlocks } from "./design-md-css";
import { codeFence, escapeCell, heading } from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";

// Agent prompt guide and the two generated stylesheet outputs (sections 13-15).

export function renderCodeSections(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	const codeReference = model.settings?.codeReference ?? "both";

	// --- 13. Agent Prompt Guide ---------------------------------------------
	lines.push("", heading(2, "Agent Prompt Guide"));
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
		"Map component measurements to existing components before editing. Preserve content and flows. After editing, report each applicable rule with its code location and token/value mapping, or explain why it remains unknown or unapplied. Do not claim a perfect visual match from limited captures.",
	);

	// --- 14. CSS Custom Properties ------------------------------------------
	const declarations = buildTokenDeclarations(model);

	if (codeReference !== "tailwind-v4") {
		const cssBlocks = propertyBlocks([
			["Colors", declarations.color],
			["Font families", declarations.font],
			["Type scale", declarations.type],
			["Spacing", declarations.spacing],
			["Container", declarations.container],
			["Radius", declarations.radius],
		]);
		if (cssBlocks.length) {
			lines.push(
				"",
				heading(2, "CSS Custom Properties"),
				"",
				"Generated from validated measurements. These are implementation aliases derived from the capture, not declarations copied from the website's own stylesheet.",
				"",
				codeFence("css", [":root {", ...cssBlocks, "}"].join("\n\n")),
			);
		}
	}

	// --- 15. Tailwind v4 -----------------------------------------------------
	if (
		codeReference !== "css" &&
		(declarations.color.length || declarations.type.length)
	) {
		const themeBlocks = propertyBlocks([
			["Colors", declarations.color],
			["Font families", declarations.font],
			["Type scale", declarations.type],
			["Spacing", declarations.spacing],
			["Container", declarations.container],
			["Radius", declarations.radius],
		]);
		lines.push(
			"",
			heading(2, "Tailwind v4"),
			"",
			codeFence("css", ["@theme {", ...themeBlocks, "}"].join("\n\n")),
		);
	}
}
