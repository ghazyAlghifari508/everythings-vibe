import { z } from "zod";
import {
	DESIGN_SYNTHESIS_MAX_COLORS,
	DESIGN_SYNTHESIS_MAX_OBSERVED_COMPONENTS,
	DESIGN_SYNTHESIS_MAX_RADII,
	DESIGN_SYNTHESIS_MAX_SPACING,
	DESIGN_SYNTHESIS_MAX_TYPOGRAPHY,
	DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS,
} from "@/features/scrape/types/scrape-constants";
import type { DesignTokenModel } from "./design-model";

// Evidence-grounded AI synthesis.
//
// The model is asked for structured analysis that references the tokens it was
// given, never for arbitrary markdown. Every reference is validated against the
// model before it can reach the document, so a hallucinated value cannot be
// rendered. When synthesis fails, the measured model still produces a complete
// document and the enrichment is reported as unavailable.

// A reference the model may cite. Both the kind and the index must resolve to a
// real entry in the model, so an invented citation is rejected rather than
// silently dropped.
const normalizeKind = (val: unknown): string => {
	if (typeof val !== "string") return String(val ?? "");
	const lower = val.trim().toLowerCase();
	if (lower === "colors" || lower === "colour" || lower === "colours")
		return "color";
	if (lower === "radii" || lower === "border-radius" || lower === "roundness")
		return "radius";
	if (lower === "typefaces" || lower === "fonts" || lower === "font")
		return "typeface";
	if (lower === "spacings" || lower === "space") return "spacing";
	if (lower === "type") return "typography";
	return lower;
};

export const evidenceReferenceSchema = z.preprocess(
	(raw) => {
		if (raw && typeof raw === "object") {
			const obj = raw as Record<string, unknown>;
			const kind = normalizeKind(obj.kind);
			const index =
				typeof obj.index === "string" && /^\d+$/.test(obj.index.trim())
					? Number.parseInt(obj.index.trim(), 10)
					: obj.index;
			return { ...obj, kind, index };
		}
		return raw;
	},
	z.strictObject({
		kind: z.enum(["color", "typography", "typeface", "spacing", "radius"]),
		index: z.number().int().nonnegative(),
	}),
);

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

const boundedText = (max: number) =>
	z.preprocess((val) => {
		if (typeof val === "string") {
			const trimmed = val.trim();
			if (
				trimmed.length > max &&
				trimmed.length <= max + Math.max(100, Math.floor(max * 0.15))
			) {
				return trimmed.slice(0, max).trim();
			}
			return trimmed;
		}
		return val;
	}, z.string().min(1).max(max));

export const designSynthesisSchema = z.strictObject({
	essence: boundedText(320),
	overview: boundedText(1200),
	theme: z.preprocess(
		(val) => {
			if (typeof val === "string") {
				const lower = val.trim().toLowerCase();
				if (lower === "light" || lower === "dark") return lower;
				return "unknown";
			}
			return val;
		},
		z.enum(["light", "dark", "unknown"]),
	),
	identityNarrative: boundedText(1200),
	componentPatterns: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(
				z.strictObject({
					name: boundedText(80),
					description: boundedText(400),
					references: z.preprocess(
						(refs) =>
							Array.isArray(refs) && refs.length > 6 ? refs.slice(0, 6) : refs,
						z.array(evidenceReferenceSchema).min(1).max(6),
					),
				}),
			)
			.max(12),
	),
	layoutPrinciples: z.preprocess(
		(val) => (val == null ? [] : val),
		z.array(boundedText(300)).max(10),
	),
	imageryNotes: z.preprocess(
		(val) => (val == null ? [] : val),
		z.array(boundedText(300)).max(8),
	),
	implementationGuidance: z.preprocess(
		(val) => (val == null ? [] : val),
		z.array(boundedText(300)).max(10),
	),
	dos: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(
				z.strictObject({
					rule: boundedText(300),
					references: z.preprocess(
						(refs) =>
							Array.isArray(refs) && refs.length > 6 ? refs.slice(0, 6) : refs,
						z.array(evidenceReferenceSchema).min(1).max(6),
					),
				}),
			)
			.max(12),
	),
	donts: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(
				z.strictObject({
					rule: boundedText(300),
					references: z.preprocess(
						(refs) =>
							Array.isArray(refs) && refs.length > 6 ? refs.slice(0, 6) : refs,
						z.array(evidenceReferenceSchema).min(1).max(6),
					),
				}),
			)
			.max(12),
	),
	limitations: z.preprocess(
		(val) => (val == null ? [] : val),
		z.array(boundedText(300)).max(12),
	),
});

export type DesignSynthesis = z.infer<typeof designSynthesisSchema>;

// The exact JSON contract handed to the model. Keeping it next to the schema
// means the instruction and the validator can never drift apart.
export function buildSynthesisInstruction(): string {
	return [
		"You are given a structured design model measured from a rendered web page.",
		"Write analysis grounded strictly in that model. Rules:",
		"- Never invent a colour value, font, size, spacing, radius, shadow or token name.",
		"- Never claim responsive, hover, focus, loading or animation behaviour; those states were not measured.",
		"- Never widen a measured value into a universal rule: state the measured component class and capture scope instead of 'all' or 'every'.",
		"- Keep observed component treatments scoped to their selectors/captures. Do not infer primary/secondary hierarchy, brand identity or global rules from frequency. Semantic roles are inferences, not measurements.",
		'- Cite evidence for every component pattern, Do and Don\'t as {"kind","index"} pairs into the model arrays you were given.',
		'- Allowed "kind" values: "color", "typography", "typeface", "spacing", "radius". "index" is the 0-based integer index.',
		'- Allowed "theme" values: "light", "dark", "unknown".',
		"- Use English for all prose.",
		'- Report what the evidence does not establish in "limitations" instead of guessing.',
		"Return one JSON object with exactly these keys:",
		'{"essence":string,"overview":string,"theme":"light"|"dark"|"unknown","identityNarrative":string,',
		'"componentPatterns":[{"name":string,"description":string,"references":[{"kind":"color"|"typography"|"typeface"|"spacing"|"radius","index":number}]}],',
		'"layoutPrinciples":[string],"imageryNotes":[string],"implementationGuidance":[string],',
		'"dos":[{"rule":string,"references":[{"kind":"color"|"typography"|"typeface"|"spacing"|"radius","index":number}]}],',
		'"donts":[{"rule":string,"references":[{"kind":"color"|"typography"|"typeface"|"spacing"|"radius","index":number}]}],',
		'"limitations":[string]}',
		"No prose, no markdown fences, no commentary.",
	].join("\n");
}

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
		capturedViews: model.capturedViews,
		analysisScope:
			model.settings?.focus === "visual-tokens"
				? "Analyze visual tokens only; return no componentPatterns."
				: model.settings?.focus === "components"
					? "Analyze observed component treatments and their measured tokens only."
					: "Analyze visual tokens and observed components.",
		sourceUrl: model.sourceUrl,
		viewport: model.viewport,
		theme: model.theme,
		baseUnitPx: Number.isFinite(model.baseUnitPx) ? model.baseUnitPx : null,
		payloadTruncated,
		observedComponents: observedComponents.slice.map((component) => ({
			name: component.name,
			description: component.description,
			evidence: component.evidence,
			frequency: component.frequency,
			roles: component.roles,
			treatmentCount: component.treatmentCount,
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
			dos: model.guidelines.dos,
			donts: model.guidelines.donts,
		},
		limitations: model.limitations,
	};
	// The payload must fit the provider budget. Component text carries the
	// longest free-form strings, so it is what gives way first, and the cut is
	// reported rather than hidden.
	let serialized = JSON.stringify(payload);
	while (
		serialized.length > DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS &&
		payload.observedComponents.length > 0
	) {
		payload.observedComponents.pop();
		payload.payloadTruncated = true;
		serialized = JSON.stringify(payload);
	}
	return serialized;
}
