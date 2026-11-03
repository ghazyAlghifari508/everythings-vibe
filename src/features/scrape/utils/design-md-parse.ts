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
	subsectionBody,
	untilSubheading,
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
	// The canonical layout nests foundations and component tables under `### `
	// subheadings; archived documents use one flat section per topic. Both are
	// read here so an old archive never loses its evidence.
	const foundations = sectionBody(sections, "Foundations / Shared Tokens");
	const nested = (heading: string, legacy: string): string[] => {
		const sub = foundations.length ? subsectionBody(foundations, heading) : [];
		return sub.length ? sub : sectionBody(sections, legacy);
	};
	const topLevel = (heading: string, legacy: string): string[] => {
		const body = sectionBody(sections, heading);
		return body.length ? body : sectionBody(sections, legacy);
	};
	const themeOverview = parseThemeOverview(
		foundations.length
			? untilSubheading(foundations)
			: sectionBody(sections, "Theme & Overview"),
		{ theme: header.theme, overview: header.overview },
	);
	const typography = parseTypography(
		nested("Typography Scale", "Tokens - Typography"),
	);
	const parsedShapes = parseSpacingShapes(
		nested("Spacing & Shapes", "Tokens - Spacing & Shapes"),
	);
	const elevation = [
		...parsedShapes.elevation,
		...parseElevation(nested("Elevation", "Elevation")),
	];
	const { dos, donts } = parseGuidelines(
		topLevel("Do's & Don'ts", "Do's and Don'ts"),
	);
	const limitations = parseLimitations(
		topLevel(
			"Coverage & Important Limitations",
			"Limitations & Confidence Notes",
		),
		version,
	);
	// These subheadings share the component section but are not components.
	const nonComponentHeadings: Record<string, true> = {
		"Imagery & Iconography": true,
		Layout: true,
	};
	const components = parseComponents(
		topLevel("Component Specifications", "Components"),
	).filter((component) => !nonComponentHeadings[component.name]);
	return {
		...EMPTY_MODEL,
		...header,
		theme: themeOverview.theme,
		overview: themeOverview.overview,
		modelVersion: version,
		colors: parseColors(nested("Colors & Semantic Roles", "Tokens - Colors")),
		typography,
		typefaces: deriveTypefaces(typography),
		spacing: parsedShapes.spacing,
		radii: parsedShapes.radii,
		elevation,
		surfaces: parseSurfaces(nested("Surfaces", "Surfaces")),
		components,
		baseUnitPx: parsedShapes.baseUnitPx,
		dos,
		donts,
		limitations,
	};
}
