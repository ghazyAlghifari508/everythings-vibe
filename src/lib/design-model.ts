import {
	type ColorClassification,
	type ColorRoleClass,
	classifyColors,
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

export interface ModelGuidelines {
	dos: ModelGuideline[];
	donts: ModelGuideline[];
	limitations: string[];
}

export interface DesignTokenModel {
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

	const limitations = [...evidence.limitations, ...guidelines.limitations];

	return {
		version: MODEL_VERSION,
		title: options.title ?? "Website Style Reference",
		essence: options.essence ?? "",
		theme: options.theme ?? "unknown",
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
		})),
		spacing: spacingTokens,
		radii: radiusTokens,
		elevation: elevationTokens,
		surfaces: surfaceTokens,
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
