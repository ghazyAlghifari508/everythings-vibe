import { z } from "zod";
import type { DesignTokenModel } from "./design-model";
import { MODEL_VERSION } from "./design-model";
import { isPillRadius } from "./design-normalize-shape";
import { primaryFontFamily } from "./design-normalize-typography";

// Renders the canonical DESIGN.md from the validated structured model. Both the
// document and the Style Inspector read the same model, so they cannot disagree,
// and the renderer never invents a value the model does not contain.

// The information architecture the document follows. Sections that the evidence
// cannot support are omitted rather than filled with placeholders, so a reader
// can trust that every present section is backed by measurement.
export const DESIGN_MD_SECTIONS = [
	"Website Identity & Visual Essence",
	"Theme & Overview",
	"Tokens - Colors",
	"Tokens - Typography",
	"Fonts & Type Scale",
	"Tokens - Spacing & Shapes",
	"Components",
	"Do's and Don'ts",
	"Surfaces",
	"Elevation",
	"Imagery & Iconography",
	"Layout",
	"Agent Prompt Guide",
	"CSS Custom Properties",
	"Tailwind v4",
	"Limitations & Confidence Notes",
	"Measurement Provenance",
] as const;

export type DesignMdSection = (typeof DESIGN_MD_SECTIONS)[number];

// Escapes a value so it can never break out of a markdown table cell or inject
// markup into the document.
export function escapeCell(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\|/g, "\\|")
		.replace(/\r?\n/g, " ");
}

// Only values that are valid CSS are emitted into a stylesheet block. Anything
// else is dropped rather than shipped as a broken declaration.
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA =
	/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i;
const CSS_LENGTH =
	/^-?(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em|%|vw|vh|vmin|vmax|dvh|dvw|ch|ex|cap|lh|cqw|cqh)$/;
const CSS_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function isValidCssColor(value: string): boolean {
	const trimmed = value.trim();
	if (HEX.test(trimmed)) return true;
	const match = trimmed.match(RGBA);
	if (!match) return false;
	const r = Number(match[1]);
	const g = Number(match[2]);
	const b = Number(match[3]);
	const a = match[4] === undefined ? 1 : Number(match[4]);
	return (
		Number.isFinite(r) &&
		Number.isFinite(g) &&
		Number.isFinite(b) &&
		Number.isFinite(a) &&
		r >= 0 &&
		r <= 255 &&
		g >= 0 &&
		g <= 255 &&
		b >= 0 &&
		b <= 255 &&
		a >= 0 &&
		a <= 1 &&
		match[4] !== "."
	);
}

export function isValidCssLength(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed === "0") return true;
	return CSS_LENGTH.test(trimmed);
}

// A CSS custom property name must be a valid identifier. Names derived from a
// role label are slugged, and a name that cannot be slugged is dropped.
export function tokenName(prefix: string, label: string): string | null {
	const slug = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug.length > 0 ? `${prefix}-${slug}` : null;
}

// Two measurements can share a purpose label while holding different values, so
// a naive slug would emit the same custom property twice with conflicting
// values. Later duplicates are suffixed to keep every declaration valid and
// unambiguous.
function uniqueTokenNames(
	entries: { name: string; value: string }[],
): { name: string; value: string }[] {
	const used = new Set<string>();
	return entries.map((entry) => {
		if (!used.has(entry.name)) {
			used.add(entry.name);
			return entry;
		}
		let suffix = 2;
		while (used.has(`${entry.name}-${suffix}`)) suffix += 1;
		const name = `${entry.name}-${suffix}`;
		used.add(name);
		return { name, value: entry.value };
	});
}

function heading(level: 1 | 2 | 3, text: string): string {
	return `${"#".repeat(level)} ${text}`;
}

function table(headers: string[], rows: string[][]): string {
	const head = `| ${headers.join(" | ")} |`;
	const divider = `| ${headers.map(() => "---").join(" | ")} |`;
	const body = rows.map((row) => `| ${row.join(" | ")} |`);
	return [head, divider, ...body].join("\n");
}

function codeFence(language: string, body: string): string {
	return [`\`\`\`${language}`, body, "```"].join("\n");
}

function distinctNonEmpty(values: string[]): string[] {
	return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export interface RenderDesignMdOptions {
	/** Enrichment prose from the AI step, already validated against the model. */
	essence?: string;
	overview?: string;
	theme?: "light" | "dark" | "unknown";
	identityNarrative?: string;
	componentPatterns?: { name: string; description: string; evidence: string }[];
	layoutPrinciples?: string[];
	imageryNotes?: string[];
	implementationGuidance?: string[];
	/** True when the AI synthesis step did not run or did not succeed. */
	enrichmentUnavailable?: boolean;
}

export function renderDesignMd(
	model: DesignTokenModel,
	options: RenderDesignMdOptions = {},
): string {
	const lines: string[] = [];
	const focus = model.settings?.focus ?? "complete";
	const tokens = focus !== "components";
	const codeReference = model.settings?.codeReference ?? "both";

	// --- 1. Website identity & visual essence --------------------------------
	const essence =
		options.essence?.trim() ||
		model.essence.trim() ||
		options.identityNarrative?.trim();
	lines.push(heading(1, `${model.title} - Style Reference`));
	if (essence) {
		lines.push("", `> ${essence}`);
	}
	lines.push("");

	// --- 2. Theme & overview -------------------------------------------------
	lines.push(heading(2, "Theme & Overview"));
	lines.push("", `**Theme:** ${model.theme}`);
	if (options.overview?.trim() || model.overview.trim())
		lines.push("", options.overview?.trim() || model.overview.trim());
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
					["Context", "Value", "Measured on"],
					model.radii.map((token) => [
						escapeCell(token.purpose),
						token.pill || isPillRadius(token.valuePx)
							? `\`${escapeCell(token.value)}\` (fully rounded / pill)`
							: `\`${escapeCell(token.value)}\``,
						String(token.frequency),
					]),
				),
			);
		}
	}

	// --- 7. Components -------------------------------------------------------
	// Observed patterns are always rendered when justified by evidence; AI
	// patterns enrich them when synthesis succeeded.
	const observedComponents = (model.observedComponents ?? []).map(
		(component) => ({
			name: component.name,
			description: component.description,
			evidence: component.evidence,
		}),
	);
	const aiComponents = options.componentPatterns ?? [];
	const seenNames = new Set(
		aiComponents.map((component) => component.name.toLowerCase()),
	);
	const mergedComponents = [
		...aiComponents,
		...observedComponents.filter(
			(component) => !seenNames.has(component.name.toLowerCase()),
		),
	];
	if (focus !== "visual-tokens" && mergedComponents.length) {
		lines.push("", heading(2, "Components"), "");
		for (const component of mergedComponents) {
			lines.push(heading(3, escapeCell(component.name)));
			lines.push("", escapeCell(component.description), "");
			lines.push(`**Evidence:** ${escapeCell(component.evidence)}`);
			lines.push(
				"",
				"Reuse this treatment for the same class of elements to retain visual consistency.",
			);
		}
	}

	// --- 8. Do's and Don'ts --------------------------------------------------
	const { dos, donts } = model.guidelines;
	if (dos.length || donts.length) {
		lines.push("", heading(2, "Do's and Don'ts"));
		lines.push(
			"",
			"Each rule is derived from a repeated measured pattern; the evidence line names it.",
		);
		if (dos.length) {
			lines.push("", heading(3, "Do"));
			for (const rule of dos)
				lines.push(
					`- ${escapeCell(rule.rule)}`,
					`  - _Evidence:_ ${escapeCell(rule.evidence)}`,
				);
		}
		if (donts.length) {
			lines.push("", heading(3, "Don't"));
			for (const rule of donts)
				lines.push(
					`- ${escapeCell(rule.rule)}`,
					`  - _Evidence:_ ${escapeCell(rule.evidence)}`,
				);
		}
	}

	// --- 9. Surfaces ---------------------------------------------------------
	if (model.surfaces.length) {
		lines.push("", heading(2, "Surfaces"), "");
		lines.push(
			table(
				["Level", "Value", "Measured on", "Purpose"],
				model.surfaces.map((surface, index) => [
					String(index),
					`\`${escapeCell(surface.value)}\``,
					String(surface.frequency),
					escapeCell(surface.roles.join(", ")),
				]),
			),
		);
	}

	// --- 10. Elevation -------------------------------------------------------
	lines.push("", heading(2, "Elevation"));
	if (model.elevation.length) {
		lines.push("");
		lines.push(
			table(
				["Shadow", "Measured on", "Notes"],
				model.elevation.map((token) => [
					`\`${escapeCell(token.value)}\``,
					String(token.frequency),
					escapeCell(token.usageNote),
				]),
			),
		);
	} else {
		lines.push(
			"",
			"No box-shadow was measured on visible elements, so elevation is not defined by shadows in this capture.",
		);
	}

	// --- 11. Imagery & Iconography ------------------------------------------
	const imagery = options.imageryNotes ?? [];
	if (imagery.length) {
		lines.push("", heading(2, "Imagery & Iconography"));
		for (const note of imagery) lines.push("", escapeCell(note));
	}

	// --- 12. Layout ----------------------------------------------------------
	const layout = options.layoutPrinciples ?? [];
	if (layout.length) {
		lines.push("", heading(2, "Layout"));
		for (const principle of layout) lines.push(`- ${escapeCell(principle)}`);
	}

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
	// Only tokens that pass validation reach the stylesheet, and generated
	// implementation aliases are labelled as generated rather than presented as
	// the website's own variables.
	// Semantic names reflect validated meaning: unknown or unproven roles use
	// measured-N aliases instead of brand/accent claims.
	const colorEntries = uniqueTokenNames(
		model.colors.flatMap((color, index) => {
			if (!isValidCssColor(color.value)) return [];
			const label =
				color.roleClass === "unknown" || color.confidence === "unknown"
					? `measured ${index + 1}`
					: color.role;
			const name = tokenName("--color", label);
			return name ? [{ name, value: color.value }] : [];
		}),
	);
	const spacingEntries = uniqueTokenNames(
		model.spacing.flatMap((token) => {
			if (!isValidCssLength(token.value)) return [];
			const name = tokenName("--spacing", token.purpose);
			return name ? [{ name, value: token.value }] : [];
		}),
	);
	const radiusEntries = uniqueTokenNames(
		model.radii.flatMap((token) => {
			if (!isValidCssLength(token.value)) return [];
			const name = tokenName("--radius", token.purpose);
			return name ? [{ name, value: token.value }] : [];
		}),
	);
	const typeEntries = uniqueTokenNames(
		model.typography.flatMap((entry) => {
			const entries: { name: string; value: string }[] = [];
			const sizeName = tokenName("--text", entry.role);
			if (sizeName && isValidCssLength(entry.fontSize))
				entries.push({ name: sizeName, value: entry.fontSize });
			const leadingName = tokenName("--leading", entry.role);
			if (
				leadingName &&
				(CSS_NUMBER.test(entry.lineHeight.trim()) ||
					isValidCssLength(entry.lineHeight))
			)
				entries.push({ name: leadingName, value: entry.lineHeight });
			const trackingName = tokenName("--tracking", entry.role);
			if (
				trackingName &&
				(entry.letterSpacing.trim() === "normal" ||
					isValidCssLength(entry.letterSpacing))
			)
				entries.push({ name: trackingName, value: entry.letterSpacing });
			return entries;
		}),
	);
	const fontEntries = uniqueTokenNames(
		model.typefaces.flatMap((typeface) => {
			const name = tokenName("--font", typeface.family);
			// A family name can only enter a declaration when it cannot break the
			// CSS syntax. Unicode letters are allowed for CJK families.
			return name && /^[\w\s,'"\-\p{L}\p{M}]+$/u.test(typeface.stack)
				? [{ name, value: typeface.stack }]
				: [];
		}),
	);
	const declaration = (entry: { name: string; value: string }) =>
		`  ${entry.name}: ${entry.value};`;
	const colorDeclarations = colorEntries.map(declaration);
	const spacingDeclarations = spacingEntries.map(declaration);
	const radiusDeclarations = radiusEntries.map(declaration);
	const typeDeclarations = typeEntries.map(declaration);
	const fontDeclarations = fontEntries.map(declaration);
	const cssBlocks: string[] = [];
	if (colorDeclarations.length)
		cssBlocks.push(["  /* Colors */", ...colorDeclarations].join("\n"));
	if (fontDeclarations.length)
		cssBlocks.push(["  /* Font families */", ...fontDeclarations].join("\n"));
	if (typeDeclarations.length)
		cssBlocks.push(["  /* Type scale */", ...typeDeclarations].join("\n"));
	if (spacingDeclarations.length)
		cssBlocks.push(["  /* Spacing */", ...spacingDeclarations].join("\n"));
	if (radiusDeclarations.length)
		cssBlocks.push(["  /* Radius */", ...radiusDeclarations].join("\n"));

	if (codeReference !== "tailwind-v4" && cssBlocks.length) {
		lines.push(
			"",
			heading(2, "CSS Custom Properties"),
			"",
			"Generated from validated measurements. These are implementation aliases derived from the capture, not declarations copied from the website's own stylesheet.",
			"",
			codeFence("css", [":root {", ...cssBlocks, "}"].join("\n\n")),
		);
	}

	// --- 15. Tailwind v4 -----------------------------------------------------
	if (
		codeReference !== "css" &&
		(colorDeclarations.length || typeDeclarations.length)
	) {
		const themeBlocks: string[] = [];
		if (colorDeclarations.length)
			themeBlocks.push(["  /* Colors */", ...colorDeclarations].join("\n"));
		if (fontDeclarations.length)
			themeBlocks.push(
				["  /* Font families */", ...fontDeclarations].join("\n"),
			);
		if (typeDeclarations.length)
			themeBlocks.push(["  /* Type scale */", ...typeDeclarations].join("\n"));
		if (spacingDeclarations.length)
			themeBlocks.push(["  /* Spacing */", ...spacingDeclarations].join("\n"));
		if (radiusDeclarations.length)
			themeBlocks.push(["  /* Radius */", ...radiusDeclarations].join("\n"));
		lines.push(
			"",
			heading(2, "Tailwind v4"),
			"",
			codeFence("css", ["@theme {", ...themeBlocks, "}"].join("\n\n")),
		);
	}

	// --- 16. Limitations & confidence notes ---------------------------------
	lines.push("", heading(2, "Limitations & Confidence Notes"));
	lines.push(
		"",
		"Measurements are observed; semantic classifications are inferred from measured usage. Missing evidence is reported as unknown rather than estimated.",
	);
	if (options.enrichmentUnavailable)
		lines.push(
			"",
			"The AI synthesis step did not produce a narrative for this capture. The measured tokens below are complete and unaffected.",
		);
	for (const limitation of model.limitations)
		lines.push(`- ${escapeCell(limitation)}`);

	// --- 17. Measurement provenance -----------------------------------------
	lines.push("", heading(2, "Measurement Provenance"), "");
	lines.push(
		table(
			["Measurement", "Count"],
			[
				[
					"Visible elements sampled",
					String(model.measurementProvenance.elements),
				],
				[
					"Colour observations",
					String(model.measurementProvenance.colorObservations),
				],
				[
					"Distinct colour values",
					String(model.measurementProvenance.distinctColorValues),
				],
				["Type styles grouped", String(model.measurementProvenance.typeStyles)],
				[
					"Spacing observations",
					String(model.measurementProvenance.spacingObservations),
				],
				[
					"Radius observations",
					String(model.measurementProvenance.radiusObservations),
				],
				[
					"Shadow observations",
					String(model.measurementProvenance.shadowObservations),
				],
			],
		),
	);
	lines.push(
		"",
		`Document model version ${MODEL_VERSION}. Captured ${model.capturedAt}.`,
	);

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Output validation
// ---------------------------------------------------------------------------

const HEX_IN_CODE = /#[0-9a-f]{3,8}\b/gi;

export interface DesignMdIssue {
	code: string;
	detail: string;
}

// Validates the rendered document as a document. It catches the failure modes
// that a structured renderer can still produce: section order drift, unbalanced
// code fences, malformed tables, invalid CSS values, missing model version and
// duplicate aliases.
export function validateDesignMd(markdown: string): DesignMdIssue[] {
	const issues: DesignMdIssue[] = [];
	if (!markdown.trim())
		return [{ code: "empty", detail: "Document is empty." }];

	const headings = [...markdown.matchAll(/^##\s+(.*)$/gm)].map((match) =>
		(match[1] ?? "").trim(),
	);
	const known = new Set<string>(DESIGN_MD_SECTIONS);
	for (const headingText of headings)
		if (!known.has(headingText))
			issues.push({
				code: "unknown-section",
				detail: `Section "${headingText}" is not part of the design system information architecture.`,
			});
	const indexes = headings
		.filter((headingText) => known.has(headingText))
		.map((headingText) =>
			DESIGN_MD_SECTIONS.indexOf(headingText as DesignMdSection),
		);
	for (let index = 1; index < indexes.length; index += 1)
		if ((indexes[index] ?? 0) <= (indexes[index - 1] ?? 0))
			issues.push({
				code: "section-order",
				detail: `Section "${headings[index]}" appears out of order.`,
			});

	const fences = markdown.match(/^```/gm)?.length ?? 0;
	if (fences % 2 !== 0)
		issues.push({ code: "code-fence", detail: "Unbalanced code fence." });

	for (const line of markdown.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|")) continue;
		const cells = trimmed.split("|").length - 2;
		if (cells < 1)
			issues.push({
				code: "table-row",
				detail: `Malformed table row: ${trimmed}`,
			});
	}

	// Every hex value inside a code fence must be a complete colour literal.
	for (const block of markdown.matchAll(/```css\n([\s\S]*?)```/g)) {
		const body = block[1] ?? "";
		for (const match of body.matchAll(HEX_IN_CODE)) {
			const value = match[0];
			if (![4, 5, 7, 9].includes(value.length))
				issues.push({
					code: "invalid-hex",
					detail: `Invalid hex colour ${value}.`,
				});
		}
		for (const declaration of body.matchAll(/:\s*([^;]+);/g)) {
			const value = (declaration[1] ?? "").trim();
			if (value.startsWith("#") && !isValidCssColor(value))
				issues.push({
					code: "invalid-css-color",
					detail: `Invalid CSS colour value ${value}.`,
				});
		}
		const names = [...body.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(
			(match) => match[1] ?? "",
		);
		const seen = new Set<string>();
		for (const name of names) {
			if (seen.has(name))
				issues.push({
					code: "duplicate-token",
					detail: `Duplicate custom property ${name}.`,
				});
			else seen.add(name);
		}
	}

	const versionMatch = markdown.match(/^Document model version (\d+)\./m);
	if (!versionMatch)
		issues.push({
			code: "missing-version",
			detail: "Document model version footer is missing.",
		});
	else if (Number(versionMatch[1]) < MODEL_VERSION)
		issues.push({
			code: "stale-version",
			detail: `Document model version ${versionMatch[1]} predates current model version ${MODEL_VERSION}.`,
		});

	return issues;
}

export const designMdIssueSchema = z.object({
	code: z.string(),
	detail: z.string(),
});
