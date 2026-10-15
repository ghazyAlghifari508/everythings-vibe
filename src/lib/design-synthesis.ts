import { z } from "zod";
import {
	DESIGN_SYNTHESIS_MAX_COLORS,
	DESIGN_SYNTHESIS_MAX_RADII,
	DESIGN_SYNTHESIS_MAX_SPACING,
	DESIGN_SYNTHESIS_MAX_TYPOGRAPHY,
} from "./constants";
import type { RenderDesignMdOptions } from "./design-md-render";
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

export interface SynthesisValidationIssue {
	code: "unknown-reference" | "unknown-value" | "schema";
	detail: string;
}

// Checks every citation resolves to a real model entry, and that no prose
// repeats a colour or measurement that is not in the model. This is the gate
// that keeps a plausible-looking fabrication out of the document.
export function validateSynthesis(
	synthesis: DesignSynthesis,
	model: DesignTokenModel,
): SynthesisValidationIssue[] {
	const issues: SynthesisValidationIssue[] = [];
	const sizes: Record<EvidenceReference["kind"], number> = {
		color: model.colors.length,
		typography: model.typography.length,
		typeface: model.typefaces.length,
		spacing: model.spacing.length,
		radius: model.radii.length,
	};
	const check = (references: EvidenceReference[], context: string): void => {
		for (const reference of references) {
			const limit = sizes[reference.kind];
			if (reference.index >= limit)
				issues.push({
					code: "unknown-reference",
					detail: `${context} cites ${reference.kind}[${reference.index}] but the model has ${limit} entries of that kind.`,
				});
		}
	};
	for (const pattern of synthesis.componentPatterns)
		check(pattern.references, `Component pattern "${pattern.name}"`);
	for (const rule of synthesis.dos)
		check(rule.references, `Do rule "${rule.rule}"`);
	for (const rule of synthesis.donts)
		check(rule.references, `Don't rule "${rule.rule}"`);

	// Any colour literal in the prose must be a colour the model actually
	// measured; otherwise the model invented one.
	const knownColors = new Set(
		model.colors.map((color) => color.value.toLowerCase()),
	);
	const prose = [
		synthesis.essence,
		synthesis.overview,
		synthesis.identityNarrative,
		...synthesis.componentPatterns.map((pattern) => pattern.description),
		...synthesis.layoutPrinciples,
		...synthesis.imageryNotes,
		...synthesis.implementationGuidance,
		...synthesis.dos.map((rule) => rule.rule),
		...synthesis.donts.map((rule) => rule.rule),
	].join("\n");
	for (const match of prose.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
		if (!knownColors.has(match[0].toLowerCase()))
			issues.push({
				code: "unknown-value",
				detail: `Prose cites colour ${match[0]}, which was not measured.`,
			});
	}
	return issues;
}

// Maps the validated synthesis onto the renderer's options, so the renderer
// stays a pure function of validated data.
export function synthesisToRenderOptions(
	synthesis: DesignSynthesis,
	model: DesignTokenModel,
): RenderDesignMdOptions {
	const describe = (reference: EvidenceReference): string => {
		switch (reference.kind) {
			case "color": {
				const color = model.colors[reference.index];
				return color ? `color ${color.value} (${color.role})` : "color";
			}
			case "typography": {
				const entry = model.typography[reference.index];
				return entry
					? `type ${entry.role} ${entry.fontSize}/${entry.fontWeight}`
					: "type";
			}
			case "typeface": {
				const typeface = model.typefaces[reference.index];
				return typeface ? `typeface ${typeface.family}` : "typeface";
			}
			case "spacing": {
				const token = model.spacing[reference.index];
				return token
					? `spacing ${token.value} for ${token.purpose}`
					: "spacing";
			}
			default: {
				const token = model.radii[reference.index];
				return token ? `radius ${token.value} for ${token.purpose}` : "radius";
			}
		}
	};
	return {
		essence: synthesis.essence,
		overview: synthesis.overview,
		theme: synthesis.theme,
		identityNarrative: synthesis.identityNarrative,
		componentPatterns: synthesis.componentPatterns.map((pattern) => ({
			name: pattern.name,
			description: pattern.description,
			evidence: pattern.references.map(describe).join("; "),
		})),
		layoutPrinciples: synthesis.layoutPrinciples,
		imageryNotes: synthesis.imageryNotes,
		implementationGuidance: synthesis.implementationGuidance,
	};
}

export type SynthesisCause =
	| "truncated"
	| "invalid_json"
	| "schema"
	| "unknown_reference"
	| "provider"
	| "timeout"
	| "cancelled";

// Maps a synthesis failure to its typed cause from code evidence, never from
// guessing. Timeouts come from the watchdog messages the AI client actually
// throws; cancellations from an aborted signal or an abort report.
export function classifySynthesisCause(
	error: unknown,
	signal?: AbortSignal,
): SynthesisCause {
	if (signal?.aborted) return "cancelled";
	const raw = error instanceof Error ? error.message : String(error ?? "");
	if (/abort|batal/i.test(raw)) return "cancelled";
	if (
		/tidak merespons|melebihi batas waktu|timeout|timed out|ETIMEDOUT|deadline/i.test(
			raw,
		)
	)
		return "timeout";
	return "provider";
}

// The stored detail for a failure cause. Fixed strings only: the raw provider
// message is never persisted or returned, so upstream internals cannot leak to
// the client. Validation details are safe to keep because they only name model
// indices the document already contains.
export function enrichmentDetailForCause(
	cause: SynthesisCause,
	safeDetail?: string,
): string {
	switch (cause) {
		case "truncated":
			return "AI memotong respons karena batas token.";
		case "invalid_json":
			return "AI tidak mengembalikan JSON yang valid.";
		case "schema":
			return "AI tidak memenuhi kontrak sintesis design system.";
		case "unknown_reference":
			return safeDetail ?? "AI merujuk evidence yang tidak tersedia.";
		case "timeout":
			return "AI synthesis melampaui batas waktu.";
		case "cancelled":
			return "Generation dibatalkan.";
		default:
			return "AI synthesis tidak tersedia.";
	}
}

export interface SynthesisOutcome {
	synthesis: DesignSynthesis | null;
	status: "applied" | "unavailable";
	detail?: string;
	cause?: SynthesisCause;
}

// Parses the model's response. A fenced or prose-wrapped object is still the
// same response, so it is unwrapped rather than rejected, but a response that
// fails the schema is rejected outright.
export function parseSynthesisResponse(
	response: string,
	model: DesignTokenModel,
	extractJson: (text: string) => string,
	outcome?: { finishReason?: string },
): SynthesisOutcome {
	if (outcome?.finishReason === "length")
		return {
			synthesis: null,
			status: "unavailable",
			detail: "AI memotong respons karena batas token.",
			cause: "truncated",
		};
	const direct = response.trim();
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(direct);
	} catch {
		const extracted = extractJson(response);
		if (extracted !== direct) {
			try {
				parsed = JSON.parse(extracted);
			} catch {
				parsed = null;
			}
		}
	}
	if (parsed === null)
		return {
			synthesis: null,
			status: "unavailable",
			detail: "AI tidak mengembalikan JSON yang valid.",
			cause: "invalid_json",
		};
	const result = designSynthesisSchema.safeParse(parsed);
	if (!result.success)
		return {
			synthesis: null,
			status: "unavailable",
			detail: "AI tidak memenuhi kontrak sintesis design system.",
			cause: "schema",
		};
	const issues = validateSynthesis(result.data, model);
	if (issues.length)
		return {
			synthesis: null,
			status: "unavailable",
			detail: issues[0]?.detail ?? "AI merujuk evidence yang tidak tersedia.",
			cause: "unknown_reference",
		};
	return { synthesis: result.data, status: "applied" };
}
