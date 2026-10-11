import { z } from "zod";
import { ScrapeError } from "./design-errors";
import { visualEvidenceSchema } from "./design-evidence-contract";
import {
	renderEvidenceDesignMd,
	type VisualEvidence,
} from "./design-visual-evidence";
import type { ScrapeInstrumentation } from "./scrape-instrumentation";
import { extractJson } from "./services/json-extract";

// The summary is a short reference list, so the number of rendered lines is
// bounded for readability. This is a presentation bound only: the model may
// legitimately return more valid references, and dropping the extras is
// honest, while rejecting the whole response would discard valid output.
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
	// Every reference in the response must resolve to a measured observation; a
	// single unsupported reference rejects the response rather than being
	// dropped, so hallucinated claims can never reach the document. Only the
	// rendered line count is capped, after validation.
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

// Accepts the model's own output only. A fenced or prose-wrapped JSON object is
// still the same response; nothing is synthesized or inferred.
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

export const DESIGN_SYSTEM_PROMPT =
	"Summarize only supplied rendered observations. Never invent measurements, semantic brand identity, fonts, tokens, responsive states or component behavior. Missing evidence is unknown. No document-length or token-count quotas.";

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

export function designIssues(text: string, evidence: VisualEvidence): string[] {
	const parsed = visualEvidenceSchema.safeParse(evidence);
	if (!parsed.success) return ["invalid visual evidence"];
	const canonical = renderEvidenceDesignMd(parsed.data);
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

export interface DesignMdEnrichment {
	status: "applied" | "unavailable";
	detail?: string;
}

export interface GeneratedDesignMd {
	document: string;
	enrichment: DesignMdEnrichment;
}

export async function generateDesignMd(
	evidence: VisualEvidence,
	instrumentation?: ScrapeInstrumentation,
	signal?: AbortSignal,
): Promise<GeneratedDesignMd> {
	const parsed = visualEvidenceSchema.safeParse(evidence);
	if (!parsed.success || !parsed.data.elements.length)
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"Evidence visual tidak tersedia.",
		);
	await instrumentation?.onActivity?.(
		"Menyusun DESIGN.md dari pengukuran browser",
	);
	const canonical = renderEvidenceDesignMd(parsed.data);
	if (!instrumentation)
		return { document: canonical, enrichment: { status: "unavailable" } };

	// The canonical document is already complete and evidence-backed. The AI
	// step only appends references to observations that were measured, so any
	// failure here degrades enrichment instead of discarding valid evidence.
	const enrichment = await enrichWithEvidenceReferences(
		parsed.data,
		instrumentation,
		signal,
	);
	const document = enrichment.summary
		? `${canonical}\n\n## Evidence Summary\n${enrichment.summary}`
		: canonical;
	await instrumentation.onActivity?.(
		"Memvalidasi kesesuaian DESIGN.md dan evidence",
	);
	if (designIssues(document, parsed.data).length)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"DESIGN.md tidak sesuai evidence.",
		);
	return {
		document,
		enrichment: enrichment.summary
			? { status: "applied" }
			: { status: "unavailable", detail: enrichment.reason },
	};
}

async function enrichWithEvidenceReferences(
	evidence: VisualEvidence,
	instrumentation: ScrapeInstrumentation,
	signal?: AbortSignal,
): Promise<{ summary?: string; reason?: string }> {
	try {
		await instrumentation.onActivity?.("AI mengorganisasi referensi evidence");
		const { selectModels, tryStreamWithFallback } = await import(
			"./services/ai-orchestrator"
		);
		const stream = await tryStreamWithFallback(
			selectModels(),
			[
				{
					role: "system",
					content: `${DESIGN_SYSTEM_PROMPT} Return JSON only: {"observations":[{"element":0,"properties":["color"]}]}. Choose meaningful existing element indices and property names. No prose or CSS values.`,
				},
				{
					role: "user",
					content: JSON.stringify(
						evidence.elements.map((element, index) => ({
							index,
							role: element.role,
							properties: element.properties,
						})),
					),
				},
			],
			signal,
			1000,
		);
		let response = stream.firstChunk;
		for await (const chunk of stream.generator) {
			if (signal?.aborted) {
				stream.abortController.abort();
				throw new ScrapeError("AI_GENERATION_FAILED", "Generation dibatalkan.");
			}
			response += chunk;
		}
		const payload = parseExplanationResponse(response);
		if (payload === null)
			throw new ScrapeError(
				"AI_GENERATION_FAILED",
				"AI mengembalikan referensi evidence tidak valid.",
			);
		const summary = renderValidatedExplanation(payload, evidence);
		return summary ? { summary } : {};
	} catch (error) {
		// A cancelled job must still stop the pipeline; every other enrichment
		// fault keeps the canonical document and reports the limitation.
		if (signal?.aborted) throw error;
		return {
			reason:
				error instanceof Error && error.message
					? error.message
					: "AI enrichment tidak tersedia.",
		};
	}
}
