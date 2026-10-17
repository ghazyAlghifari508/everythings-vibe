import {
	designMdVersionOf,
	LEGACY_DESIGN_MD_VERSION,
	normalizeDesign,
} from "../services/prompts-design-md";
import type { DesignInspectorModel } from "./design-md-inspector";
import {
	parseHeaderBlock,
	sectionBody,
	splitSections,
} from "./design-md-parse-markdown";
import {
	parseComponents,
	parseGuidelines,
	parseLimitations,
	parseThemeOverview,
} from "./design-md-parse-prose";
import {
	deriveTypefaces,
	parseColors,
	parseElevation,
	parseSpacingShapes,
	parseSurfaces,
	parseTypography,
} from "./design-md-parse-tokens";

// Parses an archived DESIGN.md. The result is always labelled unverified,
// because parsing text cannot establish that its values were measured.
const EMPTY_MODEL: DesignInspectorModel = {
	verification: "unverified",
	modelVersion: LEGACY_DESIGN_MD_VERSION,
	title: "",
	essence: "",
	theme: "unknown",
	overview: "",
	colors: [],
	typography: [],
	typefaces: [],
	spacing: [],
	radii: [],
	elevation: [],
	surfaces: [],
	components: [],
	baseUnitPx: Number.NaN,
	dos: [],
	donts: [],
	limitations: [],
};

export function parseDesignMd(designMd: string): DesignInspectorModel {
	if (!designMd || designMd.trim().length === 0) return { ...EMPTY_MODEL };
	const normalized = normalizeDesign(designMd.replace(/\r\n/g, "\n"));
	const { prelude, sections } = splitSections(normalized);
	const version = designMdVersionOf(designMd);
	const header = parseHeaderBlock(prelude);
	const themeOverview = parseThemeOverview(
		sectionBody(sections, "Theme & Overview"),
		{ theme: header.theme, overview: header.overview },
	);
	const typography = parseTypography(
		sectionBody(sections, "Tokens - Typography"),
	);
	const parsedShapes = parseSpacingShapes(
		sectionBody(sections, "Tokens - Spacing & Shapes"),
	);
	const elevation = [
		...parsedShapes.elevation,
		...parseElevation(sectionBody(sections, "Elevation")),
	];
	const { dos, donts } = parseGuidelines(
		sectionBody(sections, "Do's and Don'ts"),
	);
	const limitations = parseLimitations(
		sectionBody(sections, "Limitations & Confidence Notes"),
		version,
	);
	return {
		...EMPTY_MODEL,
		...header,
		theme: themeOverview.theme,
		overview: themeOverview.overview,
		modelVersion: version,
		colors: parseColors(sectionBody(sections, "Tokens - Colors")),
		typography,
		typefaces: deriveTypefaces(typography),
		spacing: parsedShapes.spacing,
		radii: parsedShapes.radii,
		elevation,
		surfaces: parseSurfaces(sectionBody(sections, "Surfaces")),
		components: parseComponents(sectionBody(sections, "Components")),
		baseUnitPx: parsedShapes.baseUnitPx,
		dos,
		donts,
		limitations,
	};
}
