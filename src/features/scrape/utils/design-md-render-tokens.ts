import type { DesignTokenModel } from "../services/design-model";
import {
	distinctNonEmpty,
	escapeCell,
	heading,
	table,
} from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";
import { primaryFontFamily } from "./design-normalize-typography";

// Identity, theme narrative and the measured token tables (sections 1-6).

export function renderTokenSections(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	const focus = model.settings?.focus ?? "complete";
	const tokens = focus !== "components";

	// --- 1. Website identity & visual essence --------------------------------
	const essence =
		options.essence?.trim() ||
		model.essence?.trim() ||
		options.identityNarrative?.trim();
	lines.push(heading(1, `${model.title || "Design"} - Style Reference`));
	if (essence) {
		lines.push("", `> ${essence}`);
	}
	lines.push("");

	// --- 2. Theme & overview -------------------------------------------------
	lines.push(heading(2, "Theme & Overview"));
	lines.push("", `**Theme:** ${model.theme || "light"}`);
	if (options.overview?.trim() || model.overview?.trim())
		lines.push("", options.overview?.trim() || model.overview?.trim() || "");
	lines.push(
		"",
		`Measured from ${model.viewport.width}x${model.viewport.height} on ${model.sourceUrl}. Observed values are browser measurements; role names are classifications of measured usage.`,
	);
	if (model.settings)
		lines.push(
			"",
			`Analysis scope: ${model.settings.focus}; depth: ${model.settings.depth}; code reference: ${model.settings.codeReference}.`,
		);
	for (const view of model.capturedViews ?? [])
		lines.push(
			`- Captured ${view.width}x${view.height}, browser preference ${view.colorScheme}: ${escapeCell(view.sourceUrl)}`,
		);

	// --- 3. Tokens - Colors --------------------------------------------------
	if (tokens && model.colors.length) {
		lines.push("", heading(2, "Tokens - Colors"), "");
		lines.push(
			table(
				["Name", "Value", "Token", "Role", "Confidence"],
				model.colors.map((color) => [
					escapeCell(color.name),
					`\`${escapeCell(color.value)}\``,
					color.token ? `\`${escapeCell(color.token)}\`` : "",
					escapeCell(color.role),
					color.confidence,
				]),
			),
		);
	}

	// --- 4. Tokens - Typography ---------------------------------------------
	if (tokens && model.typography.length) {
		lines.push("", heading(2, "Tokens - Typography"), "");
		lines.push(
			table(
				[
					"Role",
					"Family",
					"Size",
					"Weight",
					"Line height",
					"Letter spacing",
					"Measured on",
				],
				model.typography.map((entry) => [
					escapeCell(entry.role),
					escapeCell(primaryFontFamily(entry.fontFamily)),
					escapeCell(entry.fontSize),
					escapeCell(entry.fontWeight),
					escapeCell(entry.lineHeight),
					escapeCell(entry.letterSpacing),
					String(entry.frequency),
				]),
			),
		);
	}

	// --- 5. Fonts & Type Scale ----------------------------------------------
	if (tokens && model.typefaces.length) {
		lines.push("", heading(2, "Fonts & Type Scale"), "");
		for (const typeface of model.typefaces) {
			lines.push(heading(3, escapeCell(typeface.family)));
			lines.push(
				"",
				`- **Roles:** ${typeface.roles.join(", ") || "not classified"}`,
				`- **Measured weights:** ${typeface.measuredWeights.join(", ") || "none measured"}`,
				`- **Measured sizes:** ${typeface.measuredSizes.join(", ") || "none measured"}`,
				`- **Line heights:** ${distinctNonEmpty(typeface.lineHeights).join(", ") || "not measured"}`,
				`- **Letter spacing:** ${distinctNonEmpty(typeface.letterSpacings).join(", ") || "not measured"}`,
				`- **CSS stack:** \`${escapeCell(typeface.stack)}\``,
			);
			// Loaded status is only claimed when a declared resource reported it.
			if (typeface.declaredFaces.length) {
				lines.push(
					`- **Font loading evidence:** ${typeface.declaredFaces
						.map((face) => `${escapeCell(face.weight)} ${face.status}`)
						.join(", ")}`,
				);
			}
			if (typeface.uncertainty)
				lines.push(`- **Uncertainty:** ${escapeCell(typeface.uncertainty)}`);
		}
	}

	// --- 6. Tokens - Spacing & Shapes ---------------------------------------
	if (tokens && (model.spacing.length || model.radii.length)) {
		lines.push("", heading(2, "Tokens - Spacing & Shapes"));
		if (Number.isFinite(model.baseUnitPx))
			lines.push("", `**Base unit:** ${model.baseUnitPx}px`);
		if (model.spacing.length) {
			lines.push("", heading(3, "Spacing"), "");
			lines.push(
				table(
					["Purpose", "Property", "Value", "Measured on", "On scale"],
					model.spacing.map((token) => [
						escapeCell(token.purpose),
						escapeCell(token.property),
						`\`${escapeCell(token.value)}\``,
						String(token.frequency),
						token.onScale ? "yes" : "no",
					]),
				),
			);
		}
		if (model.radii.length) {
			lines.push("", heading(3, "Border Radius"), "");
			lines.push(
				table(
					["Context", "Value", "Captured in", "Measured on"],
					model.radii.map((token) => [
						escapeCell(token.purpose),
						// The shape annotation comes from the measured geometry. A
						// large number alone does not make a shape a pill.
						token.pill
							? `\`${escapeCell(token.value)}\` (fully rounded / pill)`
							: `\`${escapeCell(token.value)}\``,
						escapeCell(token.scope || "single capture"),
						String(token.frequency),
					]),
				),
			);
		}
	}
}
