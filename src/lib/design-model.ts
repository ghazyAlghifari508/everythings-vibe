import {
	type ColorClassification,
	type ColorRoleClass,
	classifyColors,
	normalizeColor,
} from "./design-normalize-color";
import {
	normalizeElevation,
	normalizeRadii,
	normalizeSpacing,
	normalizeSurfaces,
	type RadiusPurpose,
	type RadiusToken,
	type SpacingPurpose,
	type SpacingToken,
} from "./design-normalize-shape";
import {
	groupTypeSpecimens,
	normalizeTypefaces,
	type TypeScaleRole,
	type TypeSpecimen,
} from "./design-normalize-typography";
import type { VisualEvidence } from "./design-visual-evidence";
import { type DesignSettings, designSettingsSchema } from "./scrape-contract";

// The structured design model is the single source of truth for both the
// DESIGN.md document and the Style Inspector. Both renderers read this model, so
// they cannot disagree.
//
// Every value carries an epistemic status:
//   observed — measured directly from the rendered page.
//   inferred — a classification derived from observations, with its rationale.
//   unknown  — the capture cannot support an answer.
//
// An inferred value is never stored as an observed one.

export const MODEL_VERSION = 2 as const;

export type Confidence = "observed" | "inferred" | "unknown";

export interface ModelNote {
	confidence: Confidence;
	detail: string;
}

export interface ModelColorToken {
	name: string;
	value: string;
	token: string;
	role: string;
	roleClass: ColorRoleClass;
	frequency: number;
	/** Why this role was assigned, and what evidence supports it. */
	rationale: string;
	confidence: Confidence;
	userAgentDefault: boolean;
	variableNames: string[];
	selectors: string[];
}

export interface ModelTypeEntry {
	role: TypeScaleRole;
	fontFamily: string;
	fontSize: string;
	fontSizePx: number;
	fontWeight: string;
	lineHeight: string;
	letterSpacing: string;
	frequency: number;
	elementRoles: string[];
	sample: string;
	confidence: Confidence;
}

export interface ModelTypeface {
	family: string;
	stack: string;
	measuredWeights: string[];
	measuredSizes: string[];
	roles: TypeScaleRole[];
	lineHeights: string[];
	letterSpacings: string[];
	loadedEvidence: boolean;
	declaredFaces: { family: string; weight: string; status: string }[];
	confidence: Confidence;
	uncertainty: string | null;
	/** A real sample rendered in this family, when the capture recorded one. */
	sample: string;
}

export interface ModelSpacingToken {
	purpose: SpacingPurpose;
	property: string;
	value: string;
	valuePx: number;
	frequency: number;
	roles: string[];
	onScale: boolean;
	confidence: Confidence;
}

export interface ModelRadiusToken {
	purpose: RadiusPurpose;
	value: string;
	valuePx: number;
	frequency: number;
	roles: string[];
	confidence: Confidence;
}

export interface ModelElevationToken {
	value: string;
	frequency: number;
	roles: string[];
	usageNote: string;
	confidence: Confidence;
}

export interface ModelSurface {
	value: string;
	level: number;
	frequency: number;
	roles: string[];
	confidence: Confidence;
}

export interface ModelGuideline {
	rule: string;
	/** The measured pattern this rule was derived from. */
	evidence: string;
}

export interface ModelComponent {
	name: string;
	description: string;
	evidence: string;
	frequency: number;
	roles: string[];
}

export interface ModelGuidelines {
	dos: ModelGuideline[];
	donts: ModelGuideline[];
	limitations: string[];
}

export interface DesignTokenModel {
	settings?: DesignSettings;
	capturedViews?: {
		width: number;
		height: number;
		colorScheme: string;
		sourceUrl: string;
	}[];
	version: typeof MODEL_VERSION;
	title: string;
	essence: string;
	theme: "light" | "dark" | "unknown";
	overview: string;
	sourceUrl: string;
	capturedAt: string;
	viewport: { width: number; height: number };
	baseUnitPx: number;
	colors: ModelColorToken[];
	typography: ModelTypeEntry[];
	typefaces: ModelTypeface[];
	spacing: ModelSpacingToken[];
	radii: ModelRadiusToken[];
	elevation: ModelElevationToken[];
	surfaces: ModelSurface[];
	/** Deterministic component patterns observed in the capture. */
	observedComponents: ModelComponent[];
	guidelines: ModelGuidelines;
	/** Honest statement of what the capture could not establish. */
	limitations: string[];
	/** Every measurement stays available for audit, separate from the curation. */
	measurementProvenance: {
		elements: number;
		colorObservations: number;
		distinctColorValues: number;
		typeStyles: number;
		spacingObservations: number;
		radiusObservations: number;
		shadowObservations: number;
	};
}

// ---------------------------------------------------------------------------
// Guidance
// ---------------------------------------------------------------------------

const RULE_FREQUENCY_MINIMUM = 2;

// Guidance is derived only from repeated measured patterns. A single observation
// cannot support a rule, and no interaction, hover, focus or responsive claim is
// ever made because those states were not captured.
export function deriveModelGuidelines(
	evidence: VisualEvidence,
	colors: ColorClassification[],
	specimens: TypeSpecimen[],
	spacing: SpacingToken[],
	radii: RadiusToken[],
): ModelGuidelines {
	const dos: ModelGuideline[] = [];
	const donts: ModelGuideline[] = [];
	const limitations: string[] = [];

	const actions = evidence.elements.filter((element) => element.role === "cta");
	const actionRadii = radii.find((token) => token.purpose === "Buttons");
	if (actions.length >= RULE_FREQUENCY_MINIMUM && actionRadii)
		dos.push({
			rule: `Use ${actionRadii.value} for action buttons.`,
			evidence: `Measured on ${actionRadii.frequency} elements, including the action buttons of this page.`,
		});

	const brandColor = colors.find((entry) => entry.roleClass === "brand");
	if (brandColor)
		dos.push({
			rule: `Use ${brandColor.token.color.css} for primary actions and brand accents.`,
			evidence: brandColor.rationale,
		});

	const display = specimens.find((specimen) => specimen.role === "Display");
	const body = specimens.find((specimen) => specimen.role === "Body");
	if (display && body)
		dos.push({
			rule: `Keep display type at ${display.fontSize} and body copy at ${body.fontSize}.`,
			evidence: `Both styles were measured on rendered text; the size gap carries the hierarchy instead of colour or decoration.`,
		});

	const scaleTokens = spacing.filter(
		(token) => token.purpose === "Repeated spacing scale",
	);
	if (scaleTokens.length)
		dos.push({
			rule: `Reuse the measured spacing steps: ${scaleTokens
				.slice(0, 4)
				.map((token) => token.value)
				.join(", ")}.`,
			evidence: `Each step was measured on ${scaleTokens
				.slice(0, 4)
				.map((token) => token.frequency)
				.join(", ")} elements.`,
		});

	const distinctFamilies = new Set(
		specimens.map((specimen) => specimen.fontFamily.split(",")[0]?.trim()),
	);
	if (distinctFamilies.size > 1)
		donts.push({
			rule: `Do not introduce a font family outside the measured set (${[
				...distinctFamilies,
			]
				.filter(Boolean)
				.join(", ")}).`,
			evidence: `${distinctFamilies.size} families were measured on rendered text.`,
		});

	const radiusValues = [...new Set(radii.map((token) => token.value))];
	if (radiusValues.length > 2)
		donts.push({
			rule: `Do not treat ${radiusValues.length} measured radius values as interchangeable; assign one per component class.`,
			evidence: `${radiusValues.length} distinct radius values were measured: ${radiusValues.join(", ")}.`,
		});

	const userAgentColor = colors.find((entry) => entry.userAgentDefault);
	if (userAgentColor)
		donts.push({
			rule: `Do not present ${userAgentColor.token.color.css} as a brand colour.`,
			evidence: userAgentColor.rationale,
		});

	if (!dos.length && !donts.length)
		limitations.push(
			"Evidence did not contain enough repeated patterns to derive Do and Don't rules.",
		);

	const unloaded = evidence.fonts.filter((font) => font.status !== "loaded");
	if (unloaded.length)
		limitations.push(
			`Load status of ${unloaded.length} declared font resources was not verified, so the font actually used for glyphs is not confirmed.`,
		);

	return { dos, donts, limitations };
}

// Infers light/dark from the measured canvas background luminance. Returns
// unknown when the capture cannot support an answer, so callers never present
// a guessed theme as measured.
export function inferTheme(
	evidence: VisualEvidence,
): "light" | "dark" | "unknown" {
	const canvas = evidence.elements.find(
		(element) =>
			element.role === "canvas" && element.properties["background-color"],
	);
	const raw =
		canvas?.properties["background-color"] ??
		evidence.elements.find((element) => element.properties["background-color"])
			?.properties["background-color"] ??
		"";
	const normalized = normalizeColor(raw);
	if (!normalized || normalized.isNoOp) return "unknown";
	const luminance =
		(0.2126 * normalized.r + 0.7152 * normalized.g + 0.0722 * normalized.b) /
		255;
	if (luminance >= 0.6) return "light";
	if (luminance <= 0.4) return "dark";
	return "unknown";
}

// Deterministic component patterns observed in the capture. Only roles seen at
// least twice become patterns, and every pattern cites measured frequency and
// roles so it is evidence-grounded without AI.
export function deriveObservedComponents(
	evidence: VisualEvidence,
): ModelComponent[] {
	const components: ModelComponent[] = [];
	const byRole = new Map<string, number>();
	for (const element of evidence.elements) {
		if (element.role === "element" || element.role === "canvas") continue;
		byRole.set(element.role, (byRole.get(element.role) ?? 0) + 1);
	}
	const roleLabel: Record<string, string> = {
		nav: "Navigation",
		h1: "Hero heading",
		h2: "Section heading",
		h3: "Subheading",
		body: "Body copy",
		cta: "Buttons and CTAs",
		section: "Layout containers",
		main: "Layout containers",
		header: "Header",
		footer: "Footer",
	};
	for (const [role, frequency] of [...byRole.entries()].sort(
		(a, b) => b[1] - a[1],
	)) {
		if (frequency < RULE_FREQUENCY_MINIMUM) continue;
		const name = roleLabel[role] ?? `Observed ${role}`;
		components.push({
			name,
			description: `Observed ${frequency} ${role} elements in the captured viewport with consistent measured styling.`,
			evidence: `Measured on ${frequency} ${role} elements.`,
			frequency,
			roles: [role],
		});
		if (components.length >= 8) break;
	}
	return components;
}

// ---------------------------------------------------------------------------
// Model assembly
// ---------------------------------------------------------------------------

export interface BuildModelOptions {
	title?: string;
	essence?: string;
	overview?: string;
	theme?: "light" | "dark" | "unknown";
}

function colorNameFor(entry: ColorClassification, index: number): string {
	const base = entry.roleLabel;
	return `${base} ${index + 1}`;
}

export function buildDesignModel(
	evidence: VisualEvidence,
	options: BuildModelOptions = {},
): DesignTokenModel {
	const settings = designSettingsSchema.parse(evidence.settings ?? {});
	const views = [evidence, ...(evidence.additionalViews ?? [])];
	const capturedViews = views.map((view) => ({
		...view.viewport,
		colorScheme: view.colorScheme ?? "auto",
		sourceUrl: view.sourceUrl,
	}));
	const themes = new Set(views.map((view) => inferTheme(view)));
	if (evidence.additionalViews?.length)
		evidence = {
			...evidence,
			elements: views.flatMap((view, index) =>
				view.elements.map((element) => ({
					...element,
					selector: `[capture ${index + 1}: ${view.viewport.width}x${view.viewport.height}, ${view.colorScheme ?? "auto"}] ${element.selector}`,
				})),
			),
			fonts: views.flatMap((view) => view.fonts),
			limitations: [
				...new Set(views.flatMap((view) => view.limitations)),
				"Measurements combine separate captures; frequencies count sampled observations, not unique DOM elements across views. No interaction states or intermediate breakpoints were measured.",
			],
		};
	if (settings.focus === "components")
		evidence = {
			...evidence,
			elements: evidence.elements.filter(
				(element) => element.role !== "element" && element.role !== "canvas",
			),
		};
	const colors = classifyColors(evidence.elements);
	const spacingResult = normalizeSpacing(evidence.elements);
	const radii = normalizeRadii(evidence.elements);
	const elevation = normalizeElevation(evidence.elements);
	const surfaces = normalizeSurfaces(evidence.elements);
	const specimens = groupTypeSpecimens(evidence.elements);
	const typefaces = normalizeTypefaces(specimens, evidence.fonts);

	const colorTokens: ModelColorToken[] = colors.map((entry, index) => ({
		name: colorNameFor(entry, index),
		value: entry.token.color.css,
		token: entry.token.usage.variableNames[0] ?? "",
		role: entry.roleLabel,
		roleClass: entry.roleClass,
		frequency: entry.token.usage.frequency,
		rationale: entry.rationale,
		confidence: entry.userAgentDefault ? "unknown" : "inferred",
		userAgentDefault: entry.userAgentDefault,
		variableNames: entry.token.usage.variableNames,
		selectors: entry.token.usage.selectors,
	}));

	const typeEntries: ModelTypeEntry[] = specimens.map((specimen) => ({
		role: specimen.role,
		fontFamily: specimen.fontFamily,
		fontSize: specimen.fontSize,
		fontSizePx: specimen.fontSizePx,
		fontWeight: specimen.fontWeight,
		lineHeight: specimen.lineHeight,
		letterSpacing: specimen.letterSpacing,
		frequency: specimen.frequency,
		elementRoles: specimen.elementRoles,
		sample: specimen.sample,
		confidence: "inferred",
	}));

	const spacingTokens: ModelSpacingToken[] = spacingResult.tokens.map(
		(token) => ({
			purpose: token.purpose,
			property: token.property,
			value: token.value,
			valuePx: token.valuePx,
			frequency: token.frequency,
			roles: token.roles,
			onScale: token.onScale,
			confidence: "observed",
		}),
	);

	const radiusTokens: ModelRadiusToken[] = radii.map((token) => ({
		purpose: token.purpose,
		value: token.value,
		valuePx: token.valuePx,
		frequency: token.frequency,
		roles: token.roles,
		confidence: "observed",
	}));

	const elevationTokens: ModelElevationToken[] = elevation.map((token) => ({
		value: token.value,
		frequency: token.frequency,
		roles: token.roles,
		usageNote: token.usageNote,
		confidence:
			token.frequency >= RULE_FREQUENCY_MINIMUM ? "observed" : "unknown",
	}));

	const surfaceTokens: ModelSurface[] = surfaces.map((surface, index) => ({
		value: surface.value,
		level: index,
		frequency: surface.frequency,
		roles: surface.roles,
		confidence: "observed",
	}));

	const guidelines = deriveModelGuidelines(
		evidence,
		colors,
		specimens,
		spacingResult.tokens,
		radii,
	);

	const observedComponents =
		settings.focus === "visual-tokens"
			? []
			: deriveObservedComponents(evidence);
	const inferredTheme =
		themes.size === 1 ? inferTheme(views[0] ?? evidence) : "unknown";
	const limitations = [...evidence.limitations, ...guidelines.limitations];
	for (const view of views) {
		const appearance = inferTheme(view);
		if (
			view.colorScheme &&
			view.colorScheme !== "auto" &&
			appearance !== view.colorScheme
		)
			limitations.push(
				`Requested browser preference ${view.colorScheme} at ${view.viewport.width}px; measured canvas appearance ${appearance}. The requested site theme was not verified.`,
			);
	}
	if ((options.theme ?? inferredTheme) === "unknown")
		limitations.push(
			"Theme could not be established from the measured canvas background, so it is reported as unknown rather than estimated.",
		);

	return {
		settings,
		capturedViews,
		version: MODEL_VERSION,
		title: options.title ?? "Website Style Reference",
		essence: options.essence ?? "",
		theme: options.theme ?? inferredTheme,
		overview: options.overview ?? "",
		sourceUrl: evidence.sourceUrl,
		capturedAt: evidence.capturedAt,
		viewport: evidence.viewport,
		baseUnitPx: spacingResult.baseUnit,
		colors: colorTokens,
		typography: typeEntries,
		typefaces: typefaces.map((typeface) => ({
			family: typeface.family,
			stack: typeface.stack,
			measuredWeights: typeface.measuredWeights,
			measuredSizes: typeface.measuredSizes,
			roles: typeface.roles,
			lineHeights: typeface.lineHeights,
			letterSpacings: typeface.letterSpacings,
			loadedEvidence: typeface.loadedEvidence,
			declaredFaces: typeface.declaredFaces,
			confidence: typeface.loadedEvidence ? "observed" : "unknown",
			uncertainty: typeface.loadedEvidence
				? null
				: "No declared font resource for this family reported a loaded state, so the glyph font is not confirmed.",
			sample: typeface.sample,
		})),
		spacing: spacingTokens,
		radii: radiusTokens,
		elevation: elevationTokens,
		surfaces: surfaceTokens,
		observedComponents,
		guidelines,
		limitations,
		measurementProvenance: {
			elements: evidence.elements.length,
			colorObservations: colors.reduce(
				(total, entry) => total + entry.token.usage.frequency,
				0,
			),
			distinctColorValues: colors.length,
			typeStyles: specimens.length,
			spacingObservations: spacingResult.tokens.reduce(
				(total, token) => total + token.frequency,
				0,
			),
			radiusObservations: radii.reduce(
				(total, token) => total + token.frequency,
				0,
			),
			shadowObservations: elevation.reduce(
				(total, token) => total + token.frequency,
				0,
			),
		},
	};
}
