import {
	DESIGN_SYNTHESIS_MAX_COLORS,
	DESIGN_SYNTHESIS_MAX_OBSERVED_COMPONENTS,
	DESIGN_SYNTHESIS_MAX_RADII,
	DESIGN_SYNTHESIS_MAX_SPACING,
	DESIGN_SYNTHESIS_MAX_TYPOGRAPHY,
	DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS,
} from "@/features/scrape/types/scrape-constants";
import type { DesignTokenModel } from "./design-model";

// A compact, deterministic view of the model. Sending the whole model would
// waste context on fields the synthesis cannot cite anyway. Arrays are bounded
// so a large capture cannot overflow the prompt without an explicit marker.
export function buildSynthesisPayload(model: DesignTokenModel): string {
	const truncate = <T>(
		values: T[],
		max: number,
	): { slice: T[]; cut: boolean } =>
		values.length > max
			? { slice: values.slice(0, max), cut: true }
			: { slice: values, cut: false };
	const colors = truncate(model.colors, DESIGN_SYNTHESIS_MAX_COLORS);
	const typography = truncate(
		model.typography,
		DESIGN_SYNTHESIS_MAX_TYPOGRAPHY,
	);
	const typefaces = truncate(model.typefaces, DESIGN_SYNTHESIS_MAX_TYPOGRAPHY);
	const spacing = truncate(model.spacing, DESIGN_SYNTHESIS_MAX_SPACING);
	const radii = truncate(model.radii, DESIGN_SYNTHESIS_MAX_RADII);
	// The observed components carry measured properties and selectors, so their
	// text is bounded like every other array. A cut component list is reported
	// instead of being silently shortened.
	const observedComponents = truncate(
		model.observedComponents,
		DESIGN_SYNTHESIS_MAX_OBSERVED_COMPONENTS,
	);
	const payloadTruncated =
		colors.cut ||
		typography.cut ||
		typefaces.cut ||
		spacing.cut ||
		radii.cut ||
		observedComponents.cut;
	const payload = {
		settings: model.settings,
		viewContexts: model.views?.map((view) => ({
			id: view.id,
			label: view.label,
			observedTheme: view.observedTheme,
			colors: view.model.colors.map(({ value, role }) => ({ value, role })),
			typography: view.model.typography.map(
				({ role, fontSize, fontFamily }) => ({ role, fontSize, fontFamily }),
			),
			radii: view.model.radii.map(({ purpose, value }) => ({ purpose, value })),
		})),
		comparisons: model.comparisons?.slice(),
		capturedViews: model.capturedViews?.slice(),
		analysisScope: [
			model.settings?.focus === "visual-tokens"
				? "Analyze visual tokens only; return no componentPatterns."
				: model.settings?.focus === "components"
					? "Analyze observed component treatments and their measured tokens only."
					: "Analyze visual tokens and observed components.",
			model.settings?.depth === "detailed"
				? "Depth detailed: interpret the wider measured inventory; do not restate raw measurements."
				: "Depth standard.",
		].join(" "),
		sourceUrl: model.sourceUrl,
		viewport: model.viewport,
		theme: model.theme,
		baseUnitPx: Number.isFinite(model.baseUnitPx) ? model.baseUnitPx : null,
		payloadTruncated,
		observedComponents: observedComponents.slice.map((component) => ({
			name: component.name,
			purpose: component.purpose,
			sharedCharacteristics: component.sharedCharacteristics,
			description: component.description,
			evidence: component.evidence,
			treatments: component.treatments,
			frequency: component.frequency,
			roles: component.roles,
			treatmentCount: component.treatmentCount,
			guidance: component.guidance,
		})),
		colors: colors.slice.map((color, index) => ({
			index,
			role: color.role,
			value: color.value,
			roleClass: color.roleClass,
			frequency: color.frequency,
			confidence: color.confidence,
			rationale: color.rationale,
		})),
		typography: typography.slice.map((entry, index) => ({
			index,
			role: entry.role,
			family: entry.fontFamily,
			size: entry.fontSize,
			weight: entry.fontWeight,
			lineHeight: entry.lineHeight,
			frequency: entry.frequency,
			confidence: entry.confidence,
			elementRoles: entry.elementRoles,
		})),
		typefaces: typefaces.slice.map((typeface, index) => ({
			index,
			family: typeface.family,
			roles: typeface.roles,
			weights: typeface.measuredWeights,
			sizes: typeface.measuredSizes,
			loadedEvidence: typeface.loadedEvidence,
		})),
		spacing: spacing.slice.map((token, index) => ({
			index,
			purpose: token.purpose,
			property: token.property,
			value: token.value,
			frequency: token.frequency,
			roles: token.roles,
			confidence: token.confidence,
		})),
		radii: radii.slice.map((token, index) => ({
			index,
			purpose: token.purpose,
			value: token.value,
			frequency: token.frequency,
			roles: token.roles,
			scope: token.scope,
			confidence: token.confidence,
		})),
		elevation: model.elevation.map((token) => ({
			value: token.value,
			frequency: token.frequency,
			note: token.usageNote,
		})),
		surfaces: model.surfaces.map((surface) => ({
			value: surface.value,
			frequency: surface.frequency,
			roles: surface.roles,
		})),
		measuredGuidelines: {
			dos: model.guidelines.dos.slice(),
			donts: model.guidelines.donts.slice(),
		},
		limitations: model.limitations.slice(),
	};
	let serialized = JSON.stringify(payload);
	const optionalEvidence = [
		payload.observedComponents,
		payload.comparisons,
		payload.viewContexts,
		payload.capturedViews,
		payload.measuredGuidelines.dos,
		payload.measuredGuidelines.donts,
		payload.limitations,
		payload.elevation,
		payload.surfaces,
		payload.colors,
		payload.typography,
		payload.typefaces,
		payload.spacing,
		payload.radii,
	];
	for (const entries of optionalEvidence) {
		while (
			serialized.length > DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS &&
			entries?.length
		) {
			entries.pop();
			payload.payloadTruncated = true;
			serialized = JSON.stringify(payload);
		}
	}
	if (serialized.length > DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS)
		throw new Error("Synthesis payload metadata exceeds the provider budget");
	return serialized;
}
