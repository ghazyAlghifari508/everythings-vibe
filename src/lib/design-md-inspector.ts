export type {
	DesignInspectorModel,
	InspectorColorToken,
	InspectorComponent,
	InspectorElevationToken,
	InspectorGuideline,
	InspectorRadiusToken,
	InspectorSurface,
	InspectorToken,
	InspectorTypeEntry,
	InspectorTypeface,
	InspectorVerification,
} from "@/features/scrape/utils/design-md-inspector";
export {
	documentMatchesEvidence,
	firstCssLength,
	inspectorFromEvidence,
	inspectorFromModel,
	normalizeFontWeight,
	parseDesignMd,
} from "@/features/scrape/utils/design-md-inspector";
