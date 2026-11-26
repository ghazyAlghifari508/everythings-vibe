import type { DesignTokenModel } from "../services/design-model";
import {
	distinctNonEmpty,
	escapeCell,
	heading,
	table,
} from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";
import { primaryFontFamily } from "./design-normalize-typography";

// Identity, theme narrative and the measured token tables (sections 4-7).
// Capture contexts, requested scope and analysis status live in the overview, so
// they are stated once there instead of being repeated under the token tables.

function themeOverviewBody(
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): string[] {
	const body: string[] = [];
	body.push(`**Theme:** ${model.theme || "unknown"}`);
	const overview = options.overview?.trim() || model.overview?.trim();
	if (overview) body.push("", overview);
	return body;
}

interface RadiusRow {
	label: string;
	value: string;
	scopes: Set<string>;
	samples: number;
}

// One row per component treatment: the same value measured in two captures is
// one component fact with two scopes, not two competing tokens.
function radiusRows(
	model: DesignTokenModel,
	fallbackScope: string,
): string[][] {
	const rows = new Map<string, RadiusRow>();
	for (const token of model.radii) {
		const key = [token.purpose, token.value, token.pill ? "pill" : ""].join(
			"\u0000",
		);
		const scope = token.scope || fallbackScope;
		const existing = rows.get(key);
		if (existing) {
			existing.scopes.add(scope);
			existing.samples += token.frequency;
			continue;
		}
		rows.set(key, {
			label: token.purpose,
			// The shape annotation comes from measured geometry. A large number
			// alone does not make a shape a pill.
			value: token.pill
				? `\`${escapeCell(token.value)}\` (fully rounded / pill)`
				: `\`${escapeCell(token.value)}\``,
			scopes: new Set([scope]),
			samples: token.frequency,
		});
	}
	return [...rows.values()].map((row) => [
		escapeCell(row.label),
		row.value,
		[...row.scopes].map(escapeCell).join("; "),
		String(row.samples),
	]);
}

export function renderTokenSections(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	const focus = model.settings?.focus ?? "complete";
	const tokens = focus !== "components";

	// --- 4. Foundations / Shared Tokens --------------------------------------
	// The block is assembled first so a capture scope that contributes no
	// measured difference adds no empty heading, and the theme overview is only
	// stated once for the document.
	const foundation: string[] = [];
	if (!options.omitThemeOverview)
		foundation.push("", ...themeOverviewBody(model, options));

	// Colors: Semantic deduplication
	if (tokens && model.colors.length) {
		foundation.push("", heading(3, "Colors & Semantic Roles"));
		const uniqueColors = new Map<string, (typeof model.colors)[0]>();
		for (const color of model.colors) {
			const key = `${color.value}-${color.role}`;
			if (!uniqueColors.has(key)) uniqueColors.set(key, color);
		}
		foundation.push(
			"",
			table(
				["Semantic Role", "Value", "Confidence"],
				[...uniqueColors.values()].map((color) => [
					color.role,
					color.value,
					color.confidence,
				]),
			),
		);
	}

	// Typography
	if (tokens && model.typography.length) {
		foundation.push("", heading(3, "Typography Scale"));
		foundation.push(
			"",
			table(
				["Role", "Family", "Size", "Weight", "Line height", "Letter spacing"],
				model.typography.map((entry) => [
					escapeCell(entry.role),
					escapeCell(primaryFontFamily(entry.fontFamily)),
					escapeCell(entry.fontSize),
					escapeCell(entry.fontWeight),
					escapeCell(entry.lineHeight),
					escapeCell(entry.letterSpacing),
				]),
			),
		);
	}

	// Typefaces: family-level evidence (roles, measured sizes, CSS stack).
	if (tokens && model.typefaces.length) {
		foundation.push("", heading(3, "Fonts & Type Faces"));
		for (const typeface of model.typefaces) {
			foundation.push("", `**${escapeCell(typeface.family)}**`);
			foundation.push(
				`- Roles: ${typeface.roles.join(", ") || "not classified"}`,
				`- Weights: ${typeface.measuredWeights.join(", ") || "none measured"}`,
				`- Sizes: ${typeface.measuredSizes.join(", ") || "none measured"}`,
				`- Line heights: ${distinctNonEmpty(typeface.lineHeights).join(", ") || "not measured"}`,
				`- Letter spacing: ${distinctNonEmpty(typeface.letterSpacings).join(", ") || "not measured"}`,
				`- CSS stack: \`${escapeCell(typeface.stack)}\``,
			);
			// Loaded status is only claimed when a declared resource reported it.
			if (typeface.declaredFaces.length)
				foundation.push(
					`- Font loading evidence: ${typeface.declaredFaces
						.map((face) => `${escapeCell(face.weight)} ${face.status}`)
						.join(", ")}`,
				);
			if (typeface.uncertainty)
				foundation.push(`- Uncertainty: ${escapeCell(typeface.uncertainty)}`);
		}
	}

	// Spacing & Radius
	if (tokens && (model.spacing.length || model.radii.length)) {
		foundation.push("", heading(3, "Spacing & Shapes"));
		if (Number.isFinite(model.baseUnitPx))
			foundation.push("", `**Base unit:** ${model.baseUnitPx}px`);
		if (model.spacing.length) {
			foundation.push(
				"",
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
			foundation.push(
				"",
				table(
					["Context", "Value", "Captured in", "Measured on"],
					radiusRows(model, options.captureScopeLabel ?? "single capture"),
				),
			);
		}
	}

	// Surfaces & elevation: measured planes and shadows a reader can apply.
	if (tokens && model.surfaces.length) {
		foundation.push("", heading(3, "Surfaces"));
		foundation.push(
			"",
			table(
				["Value", "Roles", "Measured on"],
				model.surfaces.map((surface) => [
					`\`${escapeCell(surface.value)}\``,
					escapeCell(surface.roles.join(", ")),
					String(surface.frequency),
				]),
			),
		);
	}
	if (tokens && (model.elevation.length || !options.omitUnmeasuredElevation)) {
		foundation.push("", heading(3, "Elevation"));
		if (model.elevation.length) {
			foundation.push(
				"",
				table(
					["Shadow", "Roles", "Measured on", "Notes"],
					model.elevation.map((token) => [
						`\`${escapeCell(token.value)}\``,
						escapeCell(token.roles.join(", ")),
						String(token.frequency),
						escapeCell(token.usageNote),
					]),
				),
			);
		} else {
			foundation.push(
				"",
				"No box-shadow was measured on visible elements, so elevation is not defined by shadows in this capture.",
			);
		}
	}

	if (foundation.length)
		lines.push("", heading(2, "Foundations / Shared Tokens"), ...foundation);
}
