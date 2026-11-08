import { SEMANTIC_PROPERTIES } from "../services/design-capture-comparison";
import type {
	DesignTokenModel,
	ModelColorToken,
	ModelRadiusToken,
} from "../services/design-model";
import { radiusAliasLabel } from "./design-md-css";
import { escapeCell, heading } from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";
import { captureContexts } from "./design-md-render-overview";

// The implementation brief. It answers "what do I build with" before the reader
// reaches the measurement tables, and it only states facts the model contains:
// the document never invents a palette, a breakpoint or an elevation.

const BRIEF_STEP_LIMIT = 5;
const BRIEF_DIFFERENCE_LIMIT = 5;

function code(value: string): string {
	return `\`${escapeCell(value)}\``;
}

type ColorBucket =
	| "Primary / brand"
	| "Text"
	| "Surface"
	| "Border"
	| "Semantic state";

// The brief groups colours by the role the capture proved, not by palette
// internals, so an agent reads "text" and "surface" decisions directly.
function bucketOf(color: ModelColorToken): ColorBucket | null {
	switch (color.role) {
		case "Primary action":
		case "Brand accent":
		case "Accent":
		case "Action accent":
		case "Action surface":
			return "Primary / brand";
		case "Base text":
		case "Text":
			return "Text";
		case "Text and surface":
		case "Surface":
			return "Surface";
		case "Border":
			return "Border";
		case "Semantic state":
			return "Semantic state";
		default:
			return null;
	}
}

function describeColor(color: ModelColorToken): string {
	const note =
		color.confidence === "unknown" ? "role unproven" : color.confidence;
	return `${code(color.value)} (${escapeCell(color.role)}; ${note})`;
}

function visualDirection(model: DesignTokenModel): string[] {
	const parts: string[] = [];
	if (model.theme === "light" || model.theme === "dark")
		parts.push(`${model.theme} appearance`);
	const surface = model.surfaces[0];
	if (surface) parts.push(`surfaces around ${code(surface.value)}`);
	const text =
		model.colors.find((color) => color.role === "Base text") ??
		model.colors.find((color) => color.group === "text");
	if (text) parts.push(`text in ${code(text.value)}`);
	const action =
		model.colors.find((color) => color.group === "brand") ??
		model.colors.find((color) => color.role === "Action accent");
	if (action) parts.push(`actions in ${code(action.value)}`);
	const family = model.typefaces[0];
	if (family) parts.push(`type set in ${escapeCell(family.family)}`);
	return parts.length ? [`- ${parts.join("; ")}.`] : [];
}

function colorRoles(model: DesignTokenModel): string[] {
	const buckets = new Map<ColorBucket, ModelColorToken[]>();
	const evidenceOnly: ModelColorToken[] = [];
	for (const color of model.colors) {
		const bucket = bucketOf(color);
		if (!bucket) {
			evidenceOnly.push(color);
			continue;
		}
		const list = buckets.get(bucket) ?? [];
		list.push(color);
		buckets.set(bucket, list);
	}
	const lines: string[] = [];
	const order: ColorBucket[] = [
		"Primary / brand",
		"Text",
		"Surface",
		"Border",
		"Semantic state",
	];
	for (const bucket of order) {
		const colors = buckets.get(bucket);
		if (colors?.length)
			lines.push(`- ${bucket}: ${colors.map(describeColor).join("; ")}.`);
	}
	if (evidenceOnly.length)
		lines.push(
			`- Browser default or unclassifiable, so evidence only: ${evidenceOnly
				.slice(0, BRIEF_STEP_LIMIT + 1)
				.map(describeColor)
				.join("; ")}.`,
		);
	if (buckets.size)
		lines.push(
			"- Assign colour by role; a measured value whose role the capture did not prove is not a palette decision.",
		);
	return lines;
}

function typographyHierarchy(model: DesignTokenModel): string[] {
	const lines: string[] = [];
	const families = model.typefaces.map((typeface) =>
		escapeCell(typeface.family),
	);
	if (families.length)
		lines.push(
			`- Families: ${families.join(", ")}${families.length === 1 ? " (the only family measured)" : ""}.`,
		);
	const steps = [...model.typography]
		.sort((a, b) => b.fontSizePx - a.fontSizePx)
		.slice(0, BRIEF_STEP_LIMIT)
		.map((step) =>
			[
				escapeCell(step.role),
				`${escapeCell(step.fontSize)}${step.lineHeight ? `/${escapeCell(step.lineHeight)}` : ""}`,
				step.fontWeight ? `· ${escapeCell(step.fontWeight)}` : "",
				step.letterSpacing && step.letterSpacing !== "normal"
					? `· tracking ${escapeCell(step.letterSpacing)}`
					: "",
			]
				.filter(Boolean)
				.join(" "),
		);
	if (steps.length)
		lines.push(`- Measured steps (largest first): ${steps.join("; ")}.`);
	if (steps.length > 1)
		lines.push(
			"- Keep this size order; do not flatten display and body into a single step.",
		);
	return lines;
}

function surfacesAndElevation(model: DesignTokenModel): string[] {
	const lines: string[] = [];
	if (model.surfaces.length)
		lines.push(
			`- Surfaces: ${model.surfaces
				.slice(0, BRIEF_STEP_LIMIT)
				.map(
					(surface) =>
						`${code(surface.value)} (${escapeCell(surface.roles.join(", "))})`,
				)
				.join("; ")}.`,
		);
	if (!model.elevation.length)
		lines.push(
			"- No shadow was measured: separate planes with surface colour or a border instead of an invented elevation.",
		);
	else
		lines.push(
			`- Elevation: ${model.elevation
				.slice(0, BRIEF_DIFFERENCE_LIMIT)
				.map(
					(token) =>
						`${code(token.value)} (${escapeCell(token.roles.join(", "))})`,
				)
				.join("; ")}.`,
		);
	return lines;
}

function spacingAndShapes(model: DesignTokenModel): string[] {
	const lines: string[] = [];
	if (Number.isFinite(model.baseUnitPx))
		lines.push(
			`- Base unit: ${model.baseUnitPx}px; keep new spacing on its multiples.`,
		);
	const spacing = model.spacing.filter(
		(token) => token.property !== "max-width",
	);
	const scale = spacing
		.filter((token) => token.onScale)
		.slice(0, BRIEF_STEP_LIMIT);
	if (scale.length)
		lines.push(
			`- Measured spacing steps: ${scale.map((token) => code(token.value)).join(", ")}.`,
		);
	else if (spacing.length)
		lines.push(
			`- Measured spacing: ${spacing
				.slice(0, BRIEF_STEP_LIMIT)
				.map((token) => `${code(token.value)} (${escapeCell(token.purpose)})`)
				.join("; ")}.`,
		);
	const radiusLabel = (token: ModelRadiusToken) =>
		radiusAliasLabel(token).toLowerCase();
	const unique = <T>(items: T[], key: (item: T) => string): T[] => {
		const seen = new Set<string>();
		return items.filter((item) => {
			const entry = key(item);
			if (seen.has(entry)) return false;
			seen.add(entry);
			return true;
		});
	};
	const repeated = unique(
		model.radii.filter((token) => token.frequency >= 2),
		(token) => `${radiusLabel(token)}\u0000${token.value}\u0000${token.pill}`,
	);
	const single = unique(
		model.radii.filter((token) => token.frequency < 2),
		(token) => `${radiusLabel(token)}\u0000${token.value}`,
	);
	if (repeated.length)
		lines.push(
			`- Radius by component: ${repeated
				.map(
					(token) =>
						`${escapeCell(radiusLabel(token))} ${token.pill ? "fully rounded" : code(token.value)}`,
				)
				.join("; ")}.`,
		);
	if (single.length)
		lines.push(
			`- Measured once, so scoped evidence rather than a shared rule: ${single
				.map(
					(token) => `${escapeCell(radiusLabel(token))} ${code(token.value)}`,
				)
				.join("; ")}.`,
		);
	if (repeated.length > 1)
		lines.push(
			"- Keep each component's measured radius; no single radius was measured across those classes.",
		);
	return lines;
}

function responsiveBehaviour(model: DesignTokenModel): string[] {
	const differences = (model.comparisons ?? []).filter(
		(entry) => entry.kind === "responsive",
	);
	const widths = new Set(
		captureContexts(model).map((capture) => capture.width),
	);
	if (!differences.length)
		return [
			widths.size > 1
				? `- ${widths.size} viewports were measured and no matched measurement changed, so no responsive override is defined.`
				: `- Only one viewport (${[...widths][0] ?? model.viewport.width}px) was measured, so no responsive behaviour is prescribed.`,
		];
	const lines = [
		`- ${differences.length} matched measurement${differences.length === 1 ? "" : "s"} changed between captures.`,
	];
	for (const difference of differences.slice(0, BRIEF_DIFFERENCE_LIMIT))
		lines.push(
			`- ${escapeCell(SEMANTIC_PROPERTIES[difference.property] ?? difference.property)} on ${escapeCell(difference.role)}: ${difference.values
				.map((value) => `${code(value.value)} (capture ${value.capture})`)
				.join(" vs ")}.`,
		);
	lines.push(
		"- Apply these endpoint values only; they are measurements at the captured widths, not the site's original breakpoints.",
	);
	return lines;
}

export function renderImplementationGuide(
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
		`- text: ${textColor ? code(textColor.value) : "not measured"}`,
		`- surface: ${surfaceColor ? code(surfaceColor.value) : "not measured"}`,
		`- action fill: ${actionFillColor ? code(actionFillColor.value) : "not measured"}`,
		`- primary action: ${primaryActionColor ? code(primaryActionColor.value) : "not measured"}`,
		`- base spacing unit: ${Number.isFinite(model.baseUnitPx) ? `${model.baseUnitPx}px` : "not measured"}`,
	);

	// The brief is the design decision layer: roles, hierarchy, shape and
	// responsive behaviour, stated before the raw measurement tables.
	const brief: [string, string[]][] = [
		["Visual direction", visualDirection(model)],
		["Typography hierarchy", typographyHierarchy(model)],
		["Color roles", colorRoles(model)],
		["Surfaces & elevation", surfacesAndElevation(model)],
		["Spacing & shapes", spacingAndShapes(model)],
		["Responsive behaviour", responsiveBehaviour(model)],
	];
	lines.push("", "**Design brief**");
	for (const [label, body] of brief) {
		if (!body.length) continue;
		lines.push("", heading(3, label), "", ...body);
	}

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
