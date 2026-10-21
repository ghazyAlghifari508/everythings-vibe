import {
	type DesignTokenModel,
	MODEL_VERSION,
	type ModelColorToken,
	type ModelElevationToken,
	type ModelRadiusToken,
	type ModelSpacingToken,
	type ModelSurface,
	type ModelTypeEntry,
} from "@/features/scrape/types/design-model";
import { designSettingsSchema } from "@/features/scrape/types/scrape-contract";
import {
	type ColorClassification,
	classifyColors,
	collectUnsupportedColors,
} from "../utils/design-normalize-color";
import {
	normalizeElevation,
	normalizeRadii,
	normalizeSpacing,
	normalizeSurfaces,
} from "../utils/design-normalize-shape";
import {
	groupTypeSpecimens,
	normalizeTypefaces,
} from "../utils/design-normalize-typography";
import { deriveModelGuidelines } from "./design-model-guidance";
import {
	deriveObservedComponents,
	inferTheme,
	RULE_FREQUENCY_MINIMUM,
} from "./design-model-observation";
import type { VisualEvidence } from "./design-visual-evidence";

// Model assembly: every normalization step the document and the inspector read
// are combined into one validated model here.

export type {
	Confidence,
	DesignTokenModel,
	ModelColorToken,
	ModelComponent,
	ModelElevationToken,
	ModelGuideline,
	ModelGuidelines,
	ModelNote,
	ModelRadiusToken,
	ModelSpacingToken,
	ModelSurface,
	ModelTypeEntry,
	ModelTypeface,
} from "@/features/scrape/types/design-model";
export { MODEL_VERSION } from "@/features/scrape/types/design-model";
export { deriveModelGuidelines } from "./design-model-guidance";
export {
	deriveObservedComponents,
	inferTheme,
} from "./design-model-observation";

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
	const typefaces = normalizeTypefaces(
		groupTypeSpecimens(evidence.elements, true),
		evidence.fonts,
	);

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
		pill: token.pill,
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
	if (surfaces.length === 1)
		limitations.push(
			"Only a single surface colour was measured, so a surface stack cannot be established from this capture.",
		);
	if (surfaces.some((surface) => surface.value.startsWith("rgba(")))
		limitations.push(
			"One or more measured surfaces are translucent, so the effective colour depends on what is painted beneath and is reported as measured rather than as a solid surface.",
		);
	const unsupportedColors = collectUnsupportedColors(evidence.elements);
	if (unsupportedColors.length)
		limitations.push(
			`${unsupportedColors.length} measured colour value${unsupportedColors.length === 1 ? "" : "s"} use${unsupportedColors.length === 1 ? "s" : ""} a modern colour space the parser cannot reduce to sRGB (${unsupportedColors.slice(0, 3).join(", ")}); ${unsupportedColors.length === 1 ? "it is" : "they are"} omitted from tokens rather than guessed.`,
		);
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
