import { ScrapeError } from "./design-errors";
import { visualEvidenceSchema } from "./design-evidence-contract";
import {
	renderEvidenceDesignMd,
	type VisualEvidence,
} from "./design-visual-evidence";
import type { ScrapeInstrumentation } from "./scrape-instrumentation";

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
	return text === renderEvidenceDesignMd(parsed.data)
		? []
		: ["document does not match canonical evidence"];
}

export async function generateDesignMd(
	evidence: VisualEvidence,
	instrumentation?: ScrapeInstrumentation,
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
	const document = renderEvidenceDesignMd(parsed.data);
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
