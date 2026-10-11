import { z } from "zod";
import { ScrapeError } from "./design-errors";
import { visualEvidenceSchema } from "./design-evidence-contract";
import {
	renderEvidenceDesignMd,
	type VisualEvidence,
} from "./design-visual-evidence";
import type { ScrapeInstrumentation } from "./scrape-instrumentation";

const explanationSchema = z.strictObject({
	observations: z
		.array(
			z.strictObject({
				element: z.number().int().nonnegative(),
				properties: z.array(z.string()).max(6),
			}),
		)
		.max(12),
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
	return parsed.data.observations
		.flatMap((observation) => {
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
		})
		.join("\n");
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

export async function generateDesignMd(
	evidence: VisualEvidence,
	instrumentation?: ScrapeInstrumentation,
	signal?: AbortSignal,
): Promise<string> {
	const parsed = visualEvidenceSchema.safeParse(evidence);
	if (!parsed.success || !parsed.data.elements.length)
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"Evidence visual tidak tersedia.",
		);
	await instrumentation?.onActivity?.(
		"Menyusun DESIGN.md dari pengukuran browser",
	);
	let document = renderEvidenceDesignMd(parsed.data);
	if (instrumentation) {
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
						parsed.data.elements.map((element, index) => ({
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
		let payload: unknown;
		try {
			payload = JSON.parse(response);
		} catch {
			throw new ScrapeError(
				"AI_GENERATION_FAILED",
				"AI mengembalikan referensi evidence tidak valid.",
			);
		}
		const explanation = renderValidatedExplanation(payload, parsed.data);
		if (explanation) document += `\n\n## Evidence Summary\n${explanation}`;
	}
	await instrumentation?.onActivity?.(
		"Memvalidasi kesesuaian DESIGN.md dan evidence",
	);
	if (designIssues(document, parsed.data).length)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"DESIGN.md tidak sesuai evidence.",
		);
	return document;
}
