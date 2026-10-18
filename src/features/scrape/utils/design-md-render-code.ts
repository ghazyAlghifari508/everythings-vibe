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
	const brandColor = model.colors.find((color) => color.roleClass === "brand");
	const textColor = model.colors.find((color) => /text/i.test(color.role));
	const surfaceColor = model.surfaces[0];
	lines.push("", "**Quick reference**");
	lines.push(
		`- text: ${textColor ? `\`${textColor.value}\`` : "not measured"}`,
		`- surface: ${surfaceColor ? `\`${surfaceColor.value}\`` : "not measured"}`,
		`- primary action: ${brandColor ? `\`${brandColor.value}\`` : "not measured"}`,
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
