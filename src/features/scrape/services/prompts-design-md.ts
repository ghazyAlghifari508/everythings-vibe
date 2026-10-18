import { z } from "zod";
import {
	DESIGN_SYNTHESIS_DETAIL_MAX_CHARS,
	DESIGN_SYNTHESIS_MAX_TOKENS,
} from "@/features/scrape/types/scrape-constants";
import type { ScrapeInstrumentation } from "@/features/scrape/types/scrape-instrumentation";
import { ScrapeError } from "@/lib/design-errors";
import { extractJson } from "@/lib/services/json-extract";
import { visualEvidenceSchema } from "../types/design-evidence-contract";
import {
	type RenderDesignMdOptions,
	renderDesignMd,
	validateDesignMd,
} from "../utils/design-md-render";
import {
	buildDesignModel,
	type DesignTokenModel,
	MODEL_VERSION,
} from "./design-model";
import {
	buildSynthesisInstruction,
	buildSynthesisPayload,
	classifySynthesisCause,
	enrichmentDetailForCause,
	parseSynthesisResponse,
	type SynthesisCause,
	type SynthesisOutcome,
	synthesisToRenderOptions,
} from "./design-synthesis";
import type { VisualEvidence } from "./design-visual-evidence";

export const DESIGN_SYSTEM_PROMPT =
	"Summarize only supplied rendered observations. Never invent measurements, semantic brand identity, fonts, tokens, responsive states or component behavior. Missing evidence is unknown. No document-length or token-count quotas.";

export interface DesignMdEnrichment {
	status: "applied" | "unavailable";
	detail?: string;
	/** Typed failure cause, safe to persist and return to the client. */
	cause?: SynthesisCause;
}

export interface GenerateDesignMdOptions {
	/** Captured page title forwarded into the model instead of a generic heading. */
	title?: string;
}

export interface GeneratedDesignMd {
	document: string;
	enrichment: DesignMdEnrichment;
	/** The validated model both renderers read. */
	model: DesignTokenModel;
}

// The rendered document is a pure function of the validated model, so the
// document and the Style Inspector cannot disagree about a measured value.
export function renderModelDesignMd(
	model: DesignTokenModel,
	options: RenderDesignMdOptions = {},
): string {
	return renderDesignMd(model, options);
}

export async function generateDesignMd(
	evidence: VisualEvidence,
	instrumentation?: ScrapeInstrumentation,
	signal?: AbortSignal,
	options?: GenerateDesignMdOptions,
): Promise<GeneratedDesignMd> {
	const parsed = visualEvidenceSchema.safeParse(evidence);
	if (!parsed.success || !parsed.data.elements.length)
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"Evidence visual tidak tersedia.",
		);
	await instrumentation?.onActivity?.("Menormalkan evidence visual");
	const model = buildDesignModel(
		parsed.data,
		options?.title ? { title: options.title } : {},
	);

	// Without instrumentation there is no AI step at all, so the measured model
	// produces the document on its own.
	if (!instrumentation) {
		const document = renderModelDesignMd(model);
		assertDocumentValid(document);
		return { document, enrichment: { status: "unavailable" }, model };
	}

	await instrumentation.onActivity?.(
		"Menyusun DESIGN.md dari pengukuran browser",
	);
	const synthesis = await synthesizeWithEvidence(
		model,
		instrumentation,
		signal,
	);
	const renderOptions = synthesis.synthesis
		? synthesisToRenderOptions(synthesis.synthesis, model)
		: {};
	// A rejected citation names the fabrication it caught, so it is never
	// rendered verbatim: the document carries a fixed safe line while the
	// diagnostic detail stays in the enrichment result only.
	const renderDetail =
		synthesis.status === "unavailable"
			? synthesis.cause === "unknown_reference"
				? enrichmentDetailForCause("unknown_reference")
				: synthesis.detail
			: undefined;
	const document = renderModelDesignMd(model, {
		...renderOptions,
		enrichmentUnavailable: synthesis.status === "unavailable",
		enrichmentDetail: renderDetail,
	});
	await instrumentation.onActivity?.(
		"Memvalidasi kesesuaian DESIGN.md dan evidence",
	);
	assertDocumentValid(document);

	return {
		document,
		enrichment:
			synthesis.status === "applied"
				? { status: "applied" }
				: {
						status: "unavailable",
						detail: synthesis.detail,
						cause: synthesis.cause,
					},
		model,
	};
}

// A rendered document must pass its own contract before it can be stored.
function assertDocumentValid(document: string): void {
	const issues = validateDesignMd(document);
	if (issues.length)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			`DESIGN.md tidak memenuhi kontrak format: ${issues[0]?.detail ?? "unknown"}`,
		);
}

// Runs the AI synthesis step. Any failure degrades enrichment instead of
// discarding the measured model, and a cancelled job still stops the pipeline.
async function synthesizeWithEvidence(
	model: DesignTokenModel,
	instrumentation: ScrapeInstrumentation,
	signal?: AbortSignal,
): Promise<SynthesisOutcome> {
	try {
		await instrumentation.onActivity?.("AI menyusun analisis design system");
		const { selectModels, tryStreamWithFallback } = await import(
			"@/lib/services/ai-orchestrator"
		);
		const stream = await tryStreamWithFallback(
			selectModels(),
			[
				{ role: "system", content: buildSynthesisInstruction() },
				{ role: "user", content: buildSynthesisPayload(model) },
			],
			signal,
			DESIGN_SYNTHESIS_MAX_TOKENS,
		);
		let response = stream.firstChunk;
		for await (const chunk of stream.generator) {
			response += chunk;
		}
		// A job cancelled at any point during synthesis must stop the pipeline
		// rather than be reported as a degraded enrichment.
		if (signal?.aborted) {
			stream.abortController.abort();
			throw new ScrapeError("AI_GENERATION_FAILED", "Generation dibatalkan.");
		}
		return parseSynthesisResponse(response, model, extractJson, stream.outcome);
	} catch (error) {
		// A cancelled job stops the pipeline instead of degrading into a
		// measurement-only document, and the throw is normalized so callers
		// always see a typed contract error for cancellations.
		if (signal?.aborted)
			throw error instanceof ScrapeError
				? error
				: new ScrapeError("AI_GENERATION_FAILED", "Generation dibatalkan.");
		const cause = classifySynthesisCause(error, signal);
		return {
			synthesis: null,
			status: "unavailable",
			detail: enrichmentDetailForCause(cause).slice(
				0,
				DESIGN_SYNTHESIS_DETAIL_MAX_CHARS,
			),
			cause,
		};
	}
}

// ---------------------------------------------------------------------------
// Legacy compatibility layer
// ---------------------------------------------------------------------------

// Documents produced before the structured model existed are still readable.
// They are validated against the evidence that produced them, and never
// presented as verified against a current capture.
export const LEGACY_DESIGN_MD_VERSION = 1;

export function designMdVersionOf(document: string): number {
	const match = document.match(/^Document model version (\d+)\./m);
	return match?.[1] ? Number(match[1]) : LEGACY_DESIGN_MD_VERSION;
}

export function isCurrentModelDocument(document: string): boolean {
	return designMdVersionOf(document) >= MODEL_VERSION;
}

const MAX_EXPLANATION_OBSERVATIONS = 12;
const MAX_EXPLANATION_PROPERTIES = 6;

const explanationSchema = z.strictObject({
	observations: z.array(
		z.strictObject({
			element: z.number().int().nonnegative(),
			properties: z.array(z.string().max(100)).max(MAX_EXPLANATION_PROPERTIES),
		}),
	),
});

// Legacy: validates an observation-reference summary against the evidence that
// produced it. Every reference must resolve to a measured observation, so a
// hallucinated claim can never reach an archived document.
export function renderValidatedExplanation(
	value: unknown,
	evidence: VisualEvidence,
): string {
	const parsed = explanationSchema.safeParse(value);
	if (!parsed.success)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"Penjelasan AI tidak memenuhi kontrak evidence.",
		);
	const lines = parsed.data.observations.flatMap((observation) => {
		const element = evidence.elements[observation.element];
		if (
			!element ||
			observation.properties.some((property) => !element.properties[property])
		)
			throw new ScrapeError(
				"AI_GENERATION_FAILED",
				"AI merujuk evidence yang tidak tersedia.",
			);
		return observation.properties.map(
			(property) =>
				`- Elemen ${element.role} (${element.selector}) menggunakan ${property}: ${element.properties[property]}.`,
		);
	});
	return lines.slice(0, MAX_EXPLANATION_OBSERVATIONS).join("\n");
}

export function parseExplanationResponse(response: string): unknown {
	const direct = response.trim();
	try {
		return JSON.parse(direct);
	} catch {
		const extracted = extractJson(response);
		if (extracted === direct) return null;
		try {
			return JSON.parse(extracted);
		} catch {
			return null;
		}
	}
}

// Legacy: confirms an archived document still matches the capture it came from.
// A document that does not match is reported as unverified rather than trusted.
export function designIssues(text: string, evidence: VisualEvidence): string[] {
	const parsed = visualEvidenceSchema.safeParse(evidence);
	if (!parsed.success) return ["invalid visual evidence"];
	const canonical = legacyRenderEvidenceDesignMd(parsed.data);
	const suffix = text.slice(canonical.length);
	const explanationLines = suffix.startsWith("\n\n## Evidence Summary\n")
		? suffix
				.slice("\n\n## Evidence Summary\n".length)
				.split("\n")
				.filter(Boolean)
		: [];
	const allowedLines = new Set(
		parsed.data.elements.flatMap((element) =>
			Object.entries(element.properties).map(
				([property, value]) =>
					`- Elemen ${element.role} (${element.selector}) menggunakan ${property}: ${value}.`,
			),
		),
	);
	return text.startsWith(canonical) &&
		(!suffix ||
			(explanationLines.length > 0 &&
				explanationLines.every((line) => allowedLines.has(line))))
		? []
		: ["document does not match canonical evidence"];
}

// Imported here so the legacy validator renders exactly the archived shape it
// was written against.
import { renderEvidenceDesignMd as legacyRenderEvidenceDesignMd } from "./design-visual-evidence";

export function normalizeDesign(text: string): string {
	return text
		.replace(/[\u2010-\u2015]/g, "-")
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/^## Tokens\s*-\s*Colors$/gim, "## Tokens - Colors")
		.replace(/^## Tokens\s*-\s*Typography$/gim, "## Tokens - Typography")
		.replace(
			/^## Tokens\s*-\s*Spacing & Shapes$/gim,
			"## Tokens - Spacing & Shapes",
		)
		.replace(
			/^## Limitations & Confidence(?: Notes)?$/gim,
			"## Limitations & Confidence Notes",
		)
		.replace(
			/^### .*Component Prompts?.*$/gim,
			"### Example Component Prompts",
		);
}

export const designMdIssueSchema = z.object({
	code: z.string(),
	detail: z.string(),
});

export { MODEL_VERSION };
