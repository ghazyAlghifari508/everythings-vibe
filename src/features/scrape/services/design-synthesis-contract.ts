import { z } from "zod";
import {
	DESIGN_SYNTHESIS_MAX_COLORS,
	DESIGN_SYNTHESIS_MAX_RADII,
	DESIGN_SYNTHESIS_MAX_SPACING,
	DESIGN_SYNTHESIS_MAX_TYPOGRAPHY,
} from "@/lib/constants";
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
export const evidenceReferenceSchema = z.strictObject({
	kind: z.enum(["color", "typography", "typeface", "spacing", "radius"]),
	index: z.number().int().nonnegative(),
});

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

const boundedText = (max: number) => z.string().min(1).max(max);

export const designSynthesisSchema = z.strictObject({
	essence: boundedText(320),
	overview: boundedText(1200),
	theme: z.enum(["light", "dark", "unknown"]),
	identityNarrative: boundedText(1200),
	componentPatterns: z
		.array(
			z.strictObject({
				name: boundedText(80),
				description: boundedText(400),
				references: z.array(evidenceReferenceSchema).min(1).max(6),
			}),
		)
		.max(12),
	layoutPrinciples: z.array(boundedText(300)).max(10),
	imageryNotes: z.array(boundedText(300)).max(8),
	implementationGuidance: z.array(boundedText(300)).max(10),
	dos: z
		.array(
			z.strictObject({
				rule: boundedText(300),
				references: z.array(evidenceReferenceSchema).min(1).max(6),
			}),
		)
		.max(12),
	donts: z
		.array(
			z.strictObject({
				rule: boundedText(300),
				references: z.array(evidenceReferenceSchema).min(1).max(6),
			}),
		)
		.max(12),
	limitations: z.array(boundedText(300)).max(12),
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
		'- Cite evidence for every component pattern, Do and Don\'t as {"kind","index"} pairs into the model arrays you were given.',
		"- Use English for all prose.",
		'- Report what the evidence does not establish in "limitations" instead of guessing.',
		"Return one JSON object with exactly these keys:",
		'{"essence":string,"overview":string,"theme":"light"|"dark"|"unknown","identityNarrative":string,',
		'"componentPatterns":[{"name":string,"description":string,"references":[{"kind":string,"index":number}]}],',
		'"layoutPrinciples":[string],"imageryNotes":[string],"implementationGuidance":[string],',
		'"dos":[{"rule":string,"references":[{"kind":string,"index":number}]}],',
		'"donts":[{"rule":string,"references":[{"kind":string,"index":number}]}],',
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
	const payloadTruncated =
		colors.cut || typography.cut || typefaces.cut || spacing.cut || radii.cut;
	return JSON.stringify({
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
		colors: colors.slice.map((color, index) => ({
			index,
			role: color.role,
			value: color.value,
			roleClass: color.roleClass,
			frequency: color.frequency,
		})),
		typography: typography.slice.map((entry, index) => ({
			index,
			role: entry.role,
			family: entry.fontFamily,
			size: entry.fontSize,
			weight: entry.fontWeight,
			lineHeight: entry.lineHeight,
			frequency: entry.frequency,
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
		})),
		radii: radii.slice.map((token, index) => ({
			index,
			purpose: token.purpose,
			value: token.value,
			frequency: token.frequency,
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
	});
}
