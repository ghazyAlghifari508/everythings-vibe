import { z } from "zod";

export { buildSynthesisPayload } from "./design-synthesis-payload";

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

// Every text ceiling in the response contract, named so the output token
// budget can be derived from the contract instead of guessed next to it.
export const SYNTHESIS_LIMITS = {
	essence: 320,
	overview: 1200,
	identityNarrative: 1200,
	patternName: 80,
	patternDescription: 400,
	patterns: 12,
	principle: 300,
	principles: 10,
	imageryNote: 300,
	imageryNotes: 8,
	guidance: 300,
	guidanceItems: 10,
	rule: 300,
	rules: 12,
	limitation: 300,
	limitations: 12,
	references: 6,
} as const;

// Widest legal citation spelling; the index bound only inflates the estimate,
// the budget must stay an under-estimate of the worst-case response.
const WIDEST_REFERENCE = { kind: "typeface", index: 999999 };

// Serialized size of a response that fills every field of the contract. A
// budget below this number guarantees finishReason "length" for a model that
// answers the contract completely, which previously dropped every deep
// analysis narrative.
export function synthesisResponseMaxChars(): number {
	const L = SYNTHESIS_LIMITS;
	const text = (length: number) => "x".repeat(length);
	const references = Array.from({ length: L.references }, () => ({
		...WIDEST_REFERENCE,
	}));
	return JSON.stringify({
		essence: text(L.essence),
		overview: text(L.overview),
		theme: "unknown",
		identityNarrative: text(L.identityNarrative),
		componentPatterns: Array.from({ length: L.patterns }, () => ({
			name: text(L.patternName),
			description: text(L.patternDescription),
			references,
		})),
		layoutPrinciples: Array.from({ length: L.principles }, () =>
			text(L.principle),
		),
		imageryNotes: Array.from({ length: L.imageryNotes }, () =>
			text(L.imageryNote),
		),
		implementationGuidance: Array.from({ length: L.guidanceItems }, () =>
			text(L.guidance),
		),
		dos: Array.from({ length: L.rules }, () => ({
			rule: text(L.rule),
			references,
		})),
		donts: Array.from({ length: L.rules }, () => ({
			rule: text(L.rule),
			references,
		})),
		limitations: Array.from({ length: L.limitations }, () =>
			text(L.limitation),
		),
	}).length;
}

// Mixed prose+JSON output is closer to four characters per token; three is the
// floor, so the derived token count is an under-estimate, never a guess.
export const SYNTHESIS_TOKEN_MIN_CHARS = 3;

export function synthesisMaxOutputTokens(): number {
	return Math.ceil(synthesisResponseMaxChars() / SYNTHESIS_TOKEN_MIN_CHARS);
}

export const designSynthesisSchema = z.strictObject({
	essence: boundedText(SYNTHESIS_LIMITS.essence),
	overview: boundedText(SYNTHESIS_LIMITS.overview),
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
	identityNarrative: boundedText(SYNTHESIS_LIMITS.identityNarrative),
	componentPatterns: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(
				z.strictObject({
					name: boundedText(SYNTHESIS_LIMITS.patternName),
					description: boundedText(SYNTHESIS_LIMITS.patternDescription),
					references: z.preprocess(
						(refs) =>
							Array.isArray(refs) && refs.length > SYNTHESIS_LIMITS.references
								? refs.slice(0, SYNTHESIS_LIMITS.references)
								: refs,
						z
							.array(evidenceReferenceSchema)
							.min(1)
							.max(SYNTHESIS_LIMITS.references),
					),
				}),
			)
			.max(SYNTHESIS_LIMITS.patterns),
	),
	layoutPrinciples: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(boundedText(SYNTHESIS_LIMITS.principle))
			.max(SYNTHESIS_LIMITS.principles),
	),
	imageryNotes: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(boundedText(SYNTHESIS_LIMITS.imageryNote))
			.max(SYNTHESIS_LIMITS.imageryNotes),
	),
	implementationGuidance: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(boundedText(SYNTHESIS_LIMITS.guidance))
			.max(SYNTHESIS_LIMITS.guidanceItems),
	),
	dos: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(
				z.strictObject({
					rule: boundedText(SYNTHESIS_LIMITS.rule),
					references: z.preprocess(
						(refs) =>
							Array.isArray(refs) && refs.length > SYNTHESIS_LIMITS.references
								? refs.slice(0, SYNTHESIS_LIMITS.references)
								: refs,
						z
							.array(evidenceReferenceSchema)
							.min(1)
							.max(SYNTHESIS_LIMITS.references),
					),
				}),
			)
			.max(SYNTHESIS_LIMITS.rules),
	),
	donts: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(
				z.strictObject({
					rule: boundedText(SYNTHESIS_LIMITS.rule),
					references: z.preprocess(
						(refs) =>
							Array.isArray(refs) && refs.length > SYNTHESIS_LIMITS.references
								? refs.slice(0, SYNTHESIS_LIMITS.references)
								: refs,
						z
							.array(evidenceReferenceSchema)
							.min(1)
							.max(SYNTHESIS_LIMITS.references),
					),
				}),
			)
			.max(SYNTHESIS_LIMITS.rules),
	),
	limitations: z.preprocess(
		(val) => (val == null ? [] : val),
		z
			.array(boundedText(SYNTHESIS_LIMITS.limitation))
			.max(SYNTHESIS_LIMITS.limitations),
	),
});

export type DesignSynthesis = z.infer<typeof designSynthesisSchema>;

// The exact JSON contract handed to the model. Keeping it next to the schema
// means the instruction and the validator can never drift apart.
// The detailed depth must raise the interpretation bar, not the raw-number
// volume: deeper sampling is only useful if the analysis explains what the
// wider inventory means for every quality axis the deep-analysis contract
// promises.
export function buildSynthesisInstruction(
	depth: "standard" | "detailed" = "standard",
): string {
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
		...(depth === "detailed"
			? [
					"A detailed analysis was requested: the payload carries a wider measured inventory.",
					"Explain what it means; never return more raw measurements or restated numbers.",
					"Cover visual hierarchy from the measured type roles, the colour system by measured role (action, text, background, border, surfaces), spacing and radius patterns, and reusable component treatments.",
					'- Report desktop/mobile and light/dark differences only where "comparisons" entries show a measured change; name any unmeasured difference in "limitations".',
					'State confidence and uncertainty for every conclusion the inventory cannot settle in "limitations".',
				]
			: []),
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
