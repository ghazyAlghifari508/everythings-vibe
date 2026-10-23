import type { RenderDesignMdOptions } from "../utils/design-md-render";
import type { DesignTokenModel } from "./design-model";
import { validateSynthesisClaims } from "./design-synthesis-claims";
import {
	type DesignSynthesis,
	designSynthesisSchema,
	type EvidenceReference,
} from "./design-synthesis-contract";
import { validateSynthesisValues } from "./design-synthesis-values";

export type {
	DesignSynthesis,
	EvidenceReference,
} from "./design-synthesis-contract";
// Validation and failure handling for the synthesis step. A citation or a colour
// literal that the measured model does not contain is rejected here, so invalid
// synthesis never reaches the document.
export {
	buildSynthesisInstruction,
	buildSynthesisPayload,
	designSynthesisSchema,
	evidenceReferenceSchema,
} from "./design-synthesis-contract";

export interface SynthesisValidationIssue {
	code: "unknown-reference" | "unknown-value" | "unsupported-claim" | "schema";
	detail: string;
}

// Checks every citation resolves to a real model entry, that no prose repeats
// a value the model never measured, and that no rule claims a scope the
// capture cannot support. This is the gate that keeps a plausible-looking
// fabrication out of the document.
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

	// Any colour, length or family literal in the prose must be a value the
	// model actually measured; otherwise the model invented one.
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
		...synthesis.limitations,
	];
	issues.push(...validateSynthesisValues(prose, model));
	issues.push(
		...validateSynthesisClaims(
			[
				...synthesis.dos.map((rule) => rule.rule),
				...synthesis.donts.map((rule) => rule.rule),
				...synthesis.implementationGuidance,
				...synthesis.componentPatterns.map((pattern) => pattern.description),
			],
			model,
		),
	);
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
		limitations: synthesis.limitations,
	};
}

export type SynthesisCause =
	| "truncated"
	| "invalid_json"
	| "schema"
	| "unknown_reference"
	| "unsupported_claim"
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
			return safeDetail ?? "Format sintesis AI tidak sesuai skema analisis.";
		case "unknown_reference":
			return safeDetail ?? "AI merujuk evidence yang tidak tersedia.";
		case "unsupported_claim":
			return (
				safeDetail ??
				"AI menyatakan aturan yang lebih luas daripada bukti terukur."
			);
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

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		const sanitized = text.replace(/,(\s*[}\]])/g, "$1");
		try {
			return JSON.parse(sanitized);
		} catch {
			return null;
		}
	}
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
	let parsed: unknown = tryParseJson(direct);
	if (parsed === null) {
		const extracted = extractJson(response);
		if (extracted !== direct) {
			parsed = tryParseJson(extracted);
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
	if (!result.success) {
		const firstIssue = result.error.issues[0];
		const fieldPath = firstIssue?.path?.join(".") || "root";
		const diagnostic = firstIssue
			? `Format sintesis tidak sesuai pada ${fieldPath}: ${firstIssue.message}`
			: "Format respons AI tidak sesuai skema analisis.";
		return {
			synthesis: null,
			status: "unavailable",
			detail: enrichmentDetailForCause("schema", diagnostic),
			cause: "schema",
		};
	}
	const issues = validateSynthesis(result.data, model);
	if (issues.length)
		return {
			synthesis: null,
			status: "unavailable",
			detail: issues[0]?.detail ?? "AI merujuk evidence yang tidak tersedia.",
			cause:
				issues[0]?.code === "unsupported-claim"
					? "unsupported_claim"
					: "unknown_reference",
		};
	return { synthesis: result.data, status: "applied" };
}
