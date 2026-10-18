import { afterEach, expect, it, vi } from "vitest";
import type { VisualEvidence } from "@/features/scrape/services/design-visual-evidence";
import {
	designIssues,
	designMdVersionOf,
	generateDesignMd,
	isCurrentModelDocument,
	normalizeDesign,
	parseExplanationResponse,
	renderValidatedExplanation,
} from "@/features/scrape/services/prompts-design-md";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import { buildFixtureModel } from "@/lib/design-fixture";

const mocks = vi.hoisted(() => ({ tryStreamWithFallback: vi.fn() }));

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["test-model"],
	tryStreamWithFallback: mocks.tryStreamWithFallback,
}));

afterEach(() => {
	mocks.tryStreamWithFallback.mockReset();
});

function stubStream(text: string) {
	mocks.tryStreamWithFallback.mockImplementation(async () => ({
		firstChunk: text,
		generator: (async function* () {})() as AsyncGenerator<
			string,
			void,
			undefined
		>,
		abortController: new AbortController(),
		outcome: {},
	}));
}

// A synthesis response that satisfies the schema and cites real model entries.
function validSynthesis() {
	return JSON.stringify({
		essence: "A measured, restrained interface.",
		overview:
			"Hierarchy comes from a clear type scale and one repeated action colour.",
		theme: "unknown",
		identityNarrative: "The page leads with a single filled action.",
		componentPatterns: [
			{
				name: "Action button",
				description: "Solid fill with a compact label.",
				references: [{ kind: "color", index: 0 }],
			},
		],
		layoutPrinciples: ["Content is constrained to a measured max-width."],
		imageryNotes: [],
		implementationGuidance: ["Reuse the measured type scale."],
		dos: [
			{
				rule: "Keep the action colour consistent across buttons.",
				references: [{ kind: "color", index: 0 }],
			},
		],
		donts: [
			{
				rule: "Do not introduce a second action colour.",
				references: [{ kind: "color", index: 0 }],
			},
		],
		limitations: ["Responsive states were not measured."],
	});
}

const instrumentation = { onActivity: () => {} };

const evidence: VisualEvidence = {
	version: 1,
	sourceUrl: "https://example.test/",
	capturedAt: new Date().toISOString(),
	viewport: { width: 1440, height: 900 },
	elements: [
		{
			selector: "body > button",
			role: "cta",
			text: "Action",
			width: 120,
			height: 44,
			properties: {
				"background-color": "rgb(70, 180, 40)",
				"font-family": "Example, serif",
				"font-size": "19px",
			},
		},
	],
	fonts: [],
	limitations: [],
};

it("forwards the captured title instead of a generic heading", async () => {
	const { document, model } = await generateDesignMd(
		evidence,
		undefined,
		undefined,
		{
			title: "Acme Corp",
		},
	);
	expect(model.title).toBe("Acme Corp");
	expect(document).toContain("# Acme Corp - Style Reference");
});

it("codes a provider failure and redacts the raw message", async () => {
	mocks.tryStreamWithFallback.mockRejectedValue(
		new Error("upstream 500: secret-key project-123 exploded"),
	);
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("unavailable");
	expect(result.enrichment.cause).toBe("provider");
	expect(result.enrichment.detail).not.toContain("upstream 500");
	expect(result.enrichment.detail).not.toContain("secret-key");
	expect(result.document).not.toContain("upstream 500");
});

it("codes a watchdog timeout distinctly", async () => {
	mocks.tryStreamWithFallback.mockRejectedValue(
		new Error("AI tidak merespons dalam 2 menit. Coba generate ulang."),
	);
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("unavailable");
	expect(result.enrichment.cause).toBe("timeout");
});

it("propagates a midstream abort instead of degrading it", async () => {
	const controller = new AbortController();
	mocks.tryStreamWithFallback.mockImplementation(async () => {
		controller.abort();
		throw new Error("AI stream aborted");
	});
	await expect(
		generateDesignMd(evidence, instrumentation, controller.signal),
	).rejects.toMatchObject({ code: "AI_GENERATION_FAILED" });
});

it("renders a measured document from the structured model without any AI step", async () => {
	const { document, model } = await generateDesignMd(evidence);
	expect(document).toContain("## Tokens - Colors");
	expect(document).toContain("## Tokens - Typography");
	expect(document).toContain("## Measurement Provenance");
	expect(model.colors.length).toBeGreaterThan(0);
});

it("fails closed when evidence is empty", async () => {
	await expect(
		generateDesignMd({ ...evidence, elements: [] }),
	).rejects.toMatchObject({ code: "NO_ANALYZABLE_CONTENT" });
});

it("keeps the measured model when AI synthesis fails", async () => {
	for (const failure of [
		async () => {
			throw new Error("AI stream aborted");
		},
		async () => ({
			firstChunk: "not json at all",
			generator: (async function* () {})() as AsyncGenerator<
				string,
				void,
				undefined
			>,
			abortController: new AbortController(),
			outcome: {},
		}),
		async () => ({
			firstChunk: JSON.stringify({ essence: "too short a contract" }),
			generator: (async function* () {})() as AsyncGenerator<
				string,
				void,
				undefined
			>,
			abortController: new AbortController(),
			outcome: {},
		}),
	]) {
		mocks.tryStreamWithFallback.mockReset();
		mocks.tryStreamWithFallback.mockImplementation(failure);
		const result = await generateDesignMd(evidence, instrumentation);
		expect(result.enrichment.status).toBe("unavailable");
		expect(result.document).toContain("## Tokens - Colors");
		expect(result.model.colors.length).toBeGreaterThan(0);
	}
});

it("rejects a synthesis that cites evidence the model does not contain", async () => {
	stubStream(
		JSON.stringify({
			essence: "A measured, restrained interface.",
			overview: "Hierarchy comes from a clear type scale.",
			theme: "unknown",
			identityNarrative: "The page leads with a single filled action.",
			componentPatterns: [
				{
					name: "Invented",
					description: "Cites an entry that does not exist.",
					references: [{ kind: "color", index: 99 }],
				},
			],
			layoutPrinciples: [],
			imageryNotes: [],
			implementationGuidance: [],
			dos: [],
			donts: [],
			limitations: [],
		}),
	);
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("unavailable");
	expect(result.document).not.toContain("Invented");
});

it("rejects a synthesis that invents a colour value in prose", async () => {
	stubStream(
		JSON.stringify({
			essence: "A measured, restrained interface.",
			overview: "The accent is #ff00aa which was never measured.",
			theme: "unknown",
			identityNarrative: "The page leads with a single filled action.",
			componentPatterns: [],
			layoutPrinciples: [],
			imageryNotes: [],
			implementationGuidance: [],
			dos: [],
			donts: [],
			limitations: [],
		}),
	);
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("unavailable");
	expect(result.document).not.toContain("#ff00aa");
});

it("applies enrichment only when the synthesis validates against the model", async () => {
	stubStream(validSynthesis());
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("applied");
	expect(result.document).toContain("## Components");
	expect(result.document).toContain("Action button");
	expect(result.document).toContain("A measured, restrained interface.");
});

it("recovers a fenced JSON synthesis response", async () => {
	stubStream(`\`\`\`json\n${validSynthesis()}\n\`\`\``);
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("applied");
	expect(result.document).toContain("Action button");
});

it("propagates cancellation instead of degrading it into enrichment failure", async () => {
	const controller = new AbortController();
	mocks.tryStreamWithFallback.mockImplementation(async () => {
		controller.abort();
		return {
			firstChunk: "{}",
			generator: (async function* () {})() as AsyncGenerator<
				string,
				void,
				undefined
			>,
			abortController: new AbortController(),
			outcome: {},
		};
	});
	await expect(
		generateDesignMd(evidence, instrumentation, controller.signal),
	).rejects.toMatchObject({ code: "AI_GENERATION_FAILED" });
});

it("keeps archived documents readable while marking the current model", () => {
	const current = renderDesignMd(buildFixtureModel());
	expect(designMdVersionOf(current)).toBeGreaterThanOrEqual(2);
	expect(isCurrentModelDocument(current)).toBe(true);
	expect(designMdVersionOf("# Old archive\n\nSome text")).toBe(1);
	expect(isCurrentModelDocument("# Old archive\n\nSome text")).toBe(false);
});

it("retains normalization for legacy inspector documents", () => {
	expect(normalizeDesign("## Tokens - colors")).toBe("## Tokens - Colors");
});

it("only allows legacy AI references that resolve to real observations", () => {
	const summary = renderValidatedExplanation(
		{ observations: [{ element: 0, properties: ["font-size"] }] },
		evidence,
	);
	expect(summary).toContain("font-size: 19px");
	expect(() =>
		renderValidatedExplanation(
			{ observations: [{ element: 0, properties: ["not-observed"] }] },
			evidence,
		),
	).toThrow();
	expect(() =>
		renderValidatedExplanation(
			{ observations: [{ element: 20, properties: ["font-size"] }] },
			evidence,
		),
	).toThrow();
	expect(() =>
		renderValidatedExplanation(
			{
				observations: [
					{ element: 0, properties: ["font-size"], value: "48px" },
				],
			},
			evidence,
		),
	).toThrow();
});

it("keeps archived documents verifiable against the capture that produced them", () => {
	// A legacy archive is validated by the legacy contract, so old rows stay
	// readable without being presented as current-model output.
	const archived = `# Example - Style Reference\n\n**Theme:** unknown\n\nSource: https://example.test/`;
	expect(designIssues(archived, evidence)).toEqual([
		"document does not match canonical evidence",
	]);
});

it("parses a legacy fenced JSON response without inventing observations", () => {
	expect(
		parseExplanationResponse(
			'```json\n{"observations":[{"element":0,"properties":["font-size"]}]}\n```',
		),
	).toEqual({ observations: [{ element: 0, properties: ["font-size"] }] });
	expect(parseExplanationResponse("no json here")).toBeNull();
	expect(parseExplanationResponse("{ not valid json")).toBeNull();
});
