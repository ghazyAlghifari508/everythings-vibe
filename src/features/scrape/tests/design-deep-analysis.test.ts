import { afterEach, describe, expect, it, vi } from "vitest";
import type { VisualEvidence } from "@/features/scrape/services/design-visual-evidence";
import { generateDesignMd } from "@/features/scrape/services/prompts-design-md";
import {
	MAX_ENRICHMENT_ATTEMPTS,
	resolveEnrichmentRetry,
} from "@/features/scrape/services/scrape-enrichment-service";
import { parseDesignMd } from "@/features/scrape/utils/design-md-inspector";
import {
	renderDesignMd,
	validateDesignMd,
} from "@/features/scrape/utils/design-md-render";
import { assessDocumentUsability } from "@/features/scrape/utils/design-md-usability";
import { buildFixtureModel } from "@/lib/design-fixture";

const mocks = vi.hoisted(() => ({ tryStreamWithFallback: vi.fn() }));

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["test-combo-model"],
	tryStreamWithFallback: mocks.tryStreamWithFallback,
}));

afterEach(() => {
	mocks.tryStreamWithFallback.mockReset();
});

function stubStreamResponse(text: string, finishReason = "stop") {
	mocks.tryStreamWithFallback.mockImplementation(async () => ({
		firstChunk: text,
		generator: (async function* () {})() as AsyncGenerator<
			string,
			void,
			undefined
		>,
		abortController: new AbortController(),
		outcome: { finishReason },
	}));
}

function validSynthesisJson() {
	return JSON.stringify({
		essence: "A focused developer console with restrained accents.",
		overview:
			"Clear visual hierarchy driven by measured typography and balanced spacing.",
		theme: "light",
		identityNarrative: "Solid ink black actions against clean white surfaces.",
		componentPatterns: [
			{
				name: "Action Button",
				description: "Solid green fill with crisp white text.",
				references: [{ kind: "color", index: 0 }],
			},
		],
		layoutPrinciples: [
			"Consistent container max-width with structured hairline borders.",
		],
		imageryNotes: ["Hairline SVG icons only; zero decorative emoji."],
		implementationGuidance: [
			"Reuse existing design tokens; map to semantic roles.",
		],
		dos: [
			{
				rule: "Maintain verified contrast between button and canvas.",
				references: [{ kind: "color", index: 0 }],
			},
		],
		donts: [
			{
				rule: "Do not invent unmeasured hover or focus variants.",
				references: [{ kind: "color", index: 0 }],
			},
		],
		limitations: [
			"Unobserved responsive intermediate breakpoints are omitted.",
		],
	});
}

const detailedEvidence: VisualEvidence = {
	version: 1,
	sourceUrl: "https://notion.test/",
	capturedAt: new Date().toISOString(),
	viewport: { width: 1440, height: 900 },
	settings: {
		viewport: "both",
		theme: "both",
		depth: "detailed",
		focus: "complete",
		codeReference: "both",
	},
	elements: [
		{
			selector: "html:nth-child(1) > body:nth-child(1)",
			role: "canvas",
			text: "",
			width: 1440,
			height: 900,
			properties: {
				"background-color": "rgb(255, 255, 255)",
				color: "rgb(15, 15, 15)",
				"font-family": "Inter, sans-serif",
				"font-size": "16px",
			},
		},
		{
			selector: "body > main > button.primary",
			role: "cta",
			text: "Get Started",
			width: 140,
			height: 40,
			properties: {
				"background-color": "rgb(35, 131, 226)",
				color: "rgb(255, 255, 255)",
				"font-family": "Inter, sans-serif",
				"font-size": "14px",
				"font-weight": "500",
				"border-radius": "6px",
				padding: "8px 16px",
			},
		},
		{
			selector: "body > main > h1",
			role: "h1",
			text: "Think it. Plan it. Build it.",
			width: 800,
			height: 72,
			properties: {
				color: "rgb(15, 15, 15)",
				"font-family": "Inter, sans-serif",
				"font-size": "48px",
				"font-weight": "700",
				"line-height": "56px",
			},
		},
	],
	fonts: [
		{
			family: "Inter",
			weight: "500",
			status: "loaded",
		},
		{
			family: "Inter",
			weight: "700",
			status: "loaded",
		},
	],
	limitations: [],
};

describe("Section 8: Deep Analysis Automated Verification (p2.md)", () => {
	it("1. deep analysis succeeds with valid structured output and detailed instructions", async () => {
		stubStreamResponse(validSynthesisJson());
		const result = await generateDesignMd(detailedEvidence, {
			onActivity: () => {},
		});

		expect(result.enrichment.status).toBe("applied");
		expect(result.document).toContain("Action Button");
		expect(result.document).toContain(
			"A focused developer console with restrained accents.",
		);
		expect(validateDesignMd(result.document)).toEqual([]);

		// Verify that detailed depth was passed into the system instruction
		expect(mocks.tryStreamWithFallback).toHaveBeenCalled();
		const messages = mocks.tryStreamWithFallback.mock.calls[0]?.[1];
		expect(messages?.[0]?.content).toMatch(/detailed analysis was requested/i);
		expect(messages?.[0]?.content).toMatch(
			/never return more raw measurements/i,
		);
	});

	it("2. gracefully handles provider error without crashing or leaking secrets", async () => {
		mocks.tryStreamWithFallback.mockRejectedValue(
			new Error("503 Upstream Provider Exploded: bearer-token-xyz"),
		);
		const result = await generateDesignMd(detailedEvidence, {
			onActivity: () => {},
		});

		expect(result.enrichment.status).toBe("unavailable");
		expect(result.enrichment.cause).toBe("provider");
		expect(result.enrichment.detail).not.toMatch(/bearer-token/i);
		expect(result.document).toContain("### Colors & Semantic Roles");
		expect(result.document).not.toMatch(/bearer-token/i);
		expect(validateDesignMd(result.document)).toEqual([]);
	});

	it("3. classifies watchdog timeout distinctly from generic provider faults", async () => {
		mocks.tryStreamWithFallback.mockRejectedValue(
			new Error("AI tidak merespons dalam 2 menit. Coba generate ulang."),
		);
		const result = await generateDesignMd(detailedEvidence, {
			onActivity: () => {},
		});

		expect(result.enrichment.status).toBe("unavailable");
		expect(result.enrichment.cause).toBe("timeout");
		expect(result.enrichment.detail).toBe(
			"AI synthesis melampaui batas waktu.",
		);
		expect(result.document).toContain("### Colors & Semantic Roles");
	});

	it("4. rejects invalid schema from being silently inserted", async () => {
		stubStreamResponse(JSON.stringify({ badField: "unknown", count: 123 }));
		const result = await generateDesignMd(detailedEvidence, {
			onActivity: () => {},
		});

		expect(result.enrichment.status).toBe("unavailable");
		expect(result.enrichment.cause).toBe("schema");
		expect(result.document).not.toContain("badField");
		expect(result.document).toContain("### Colors & Semantic Roles");
	});

	it("5. classifies partial / truncated AI response explicitly from finishReason length", async () => {
		stubStreamResponse(
			'{"essence": "Incomplete sentence that cut off...',
			"length",
		);
		const result = await generateDesignMd(detailedEvidence, {
			onActivity: () => {},
		});

		expect(result.enrichment.status).toBe("unavailable");
		expect(result.enrichment.cause).toBe("truncated");
		expect(result.enrichment.detail).toMatch(/batas token/i);
		expect(result.document).toContain("### Colors & Semantic Roles");
	});

	it("6. fails closed when no visual evidence exists", async () => {
		await expect(
			generateDesignMd({ ...detailedEvidence, elements: [] }),
		).rejects.toMatchObject({ code: "NO_ANALYZABLE_CONTENT" });
	});

	it("7. processes multiple captures independently and preserves scoped differences", async () => {
		stubStreamResponse(validSynthesisJson());
		const canvasEl = detailedEvidence.elements[0];
		const ctaEl = detailedEvidence.elements[1];
		if (!canvasEl || !ctaEl) throw new Error("Fixture elements missing");

		const mobile = {
			version: 1 as const,
			sourceUrl: detailedEvidence.sourceUrl,
			capturedAt: detailedEvidence.capturedAt,
			viewport: { width: 390, height: 844 },
			elements: [
				canvasEl,
				{
					...ctaEl,
					properties: {
						...ctaEl.properties,
						"background-color": "rgb(20, 25, 30)",
					},
				},
			],
			fonts: detailedEvidence.fonts,
			limitations: [],
		};

		const result = await generateDesignMd(
			{ ...detailedEvidence, additionalViews: [mobile] },
			{ onActivity: () => {} },
		);

		expect(result.enrichment.status).toBe("applied");
		expect(mocks.tryStreamWithFallback).toHaveBeenCalledTimes(2);
		expect(result.document).toContain("This document combines 2 captures.");
		expect(result.document).toContain("Responsive Differences");
		expect(result.document).toContain(
			"Capture 1: 1440x900, browser preference auto",
		);
		expect(result.document).toContain(
			"Capture 2: 390x844, browser preference auto",
		);
	});

	it("8. renders valid measurement-only result when no AI step is requested", async () => {
		const result = await generateDesignMd(detailedEvidence);

		expect(result.enrichment.status).toBe("unavailable");
		expect(result.document).toContain("### Colors & Semantic Roles");
		expect(result.document).toContain("**Coverage:**");
		expect(validateDesignMd(result.document)).toEqual([]);
	});

	it("9. persists and rehydrates enrichment status truthfully", () => {
		const usableApplied = assessDocumentUsability({
			designMd: renderDesignMd(buildFixtureModel()),
			enrichment: "applied",
		});
		expect(usableApplied.isUsable).toBe(true);
		expect(usableApplied.isMateriallyIncomplete).toBe(false);

		// When component recipes are missing in fallback, usability marks material incompleteness
		const missingComponentsFallbackDoc = `# Acme Corp - Style Reference
> Measured directly from website capture.

**Theme:** dark

## Tokens - Colors
| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Canvas | #0b0f17 | --color-canvas | Background surface |

## Tokens - Typography
| Style | Family | Size | Weight | Line Height |
| --- | --- | --- | --- | --- |
| Display | Inter | 40px | 700 | 1.2 |

## Limitations & Confidence Notes
- Measured from visible desktop viewport at 1440x900.
`;

		const fallback = assessDocumentUsability({
			designMd: missingComponentsFallbackDoc,
			enrichment: "unavailable",
			recoveryStatus: "exhausted",
		});
		expect(fallback.isUsable).toBe(true);
		expect(fallback.isMateriallyIncomplete).toBe(true);
		expect(fallback.notice).toMatch(/panduan komponen belum tersedia/i);
	});

	it("10. prevents duplicate concurrent retries and respects max attempts limit", () => {
		expect(
			resolveEnrichmentRetry({
				enrichment: "applied",
				hasDocument: true,
				hasEvidence: true,
			}),
		).toEqual({ proceed: false, mode: "replay" });

		expect(
			resolveEnrichmentRetry({
				enrichment: "unavailable",
				hasDocument: true,
				hasEvidence: true,
				attempts: MAX_ENRICHMENT_ATTEMPTS,
			}),
		).toEqual({ proceed: false, mode: "exhausted" });
	});

	it("11. AI narrative never alters or overwrites measured token values", () => {
		const fixture = buildFixtureModel();
		const enriched = renderDesignMd(fixture, {
			essence: "AI narrative overview.",
			overview: "Detailed visual hierarchy.",
		});
		const fallback = renderDesignMd(fixture, { enrichmentUnavailable: true });

		const enrichedParsed = parseDesignMd(enriched);
		const fallbackParsed = parseDesignMd(fallback);

		expect(enrichedParsed.colors.map((c) => c.value)).toEqual(
			fallbackParsed.colors.map((c) => c.value),
		);
		expect(enrichedParsed.typography.map((t) => t.size)).toEqual(
			fallbackParsed.typography.map((t) => t.size),
		);
		expect(enrichedParsed.spacing.map((s) => s.value)).toEqual(
			fallbackParsed.spacing.map((s) => s.value),
		);
	});

	it("12. document never falsely claims deep analysis succeeded when enrichment is unavailable", () => {
		const fixture = buildFixtureModel();
		const fallback = renderDesignMd(fixture, { enrichmentUnavailable: true });

		expect(fallback).toMatch(/AI synthesis.*did not produce a narrative/i);
		expect(fallback).not.toMatch(/AI inference/i);
		expect(fallback).not.toMatch(/A focused developer console/i);
	});
});
