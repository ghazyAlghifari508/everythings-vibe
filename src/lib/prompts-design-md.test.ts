import { afterEach, expect, it, vi } from "vitest";
import type { VisualEvidence } from "./design-visual-evidence";
import {
	designIssues,
	generateDesignMd,
	normalizeDesign,
	parseExplanationResponse,
	renderValidatedExplanation,
} from "./prompts-design-md";

const mocks = vi.hoisted(() => ({ tryStreamWithFallback: vi.fn() }));

vi.mock("./services/ai-orchestrator", () => ({
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

it("accepts a sparse measured document and rejects any unsupported modification", async () => {
	const { document } = await generateDesignMd(evidence);
	expect(designIssues(document, evidence)).toEqual([]);
	expect(designIssues(document.replace("19px", "48px"), evidence)).toEqual([
		"document does not match canonical evidence",
	]);
	expect(designIssues(`${document}\n--invented: blue`, evidence)).toHaveLength(
		1,
	);
});

it("fails closed when evidence is empty", async () => {
	await expect(
		generateDesignMd({ ...evidence, elements: [] }),
	).rejects.toMatchObject({ code: "NO_ANALYZABLE_CONTENT" });
});

it("retains normalization for legacy inspector documents", () => {
	expect(normalizeDesign("## Tokens - colors")).toBe("## Tokens - Colors");
});

it("only allows AI to select real property references, never supply CSS values", async () => {
	const summary = renderValidatedExplanation(
		{ observations: [{ element: 0, properties: ["font-size"] }] },
		evidence,
	);
	const { document } = await generateDesignMd(evidence);
	expect(
		designIssues(`${document}\n\n## Evidence Summary\n${summary}`, evidence),
	).toEqual([]);
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

it("keeps the canonical document when the optional AI reference summary fails", async () => {
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
			firstChunk: JSON.stringify({
				observations: [{ element: 99, properties: ["font-size"] }],
			}),
			generator: (async function* () {})() as AsyncGenerator<
				string,
				void,
				undefined
			>,
			abortController: new AbortController(),
			outcome: {},
		}),
		async () => ({
			firstChunk: JSON.stringify({
				observations: [{ element: 0, properties: ["not-observed"] }],
			}),
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
		expect(result.document).toContain("19px");
		expect(result.document).not.toContain("## Evidence Summary");
		expect(designIssues(result.document, evidence)).toEqual([]);
	}
});

it("reports applied enrichment only when the summary actually validates", async () => {
	stubStream(
		JSON.stringify({
			observations: [{ element: 0, properties: ["font-size"] }],
		}),
	);
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("applied");
	expect(result.document).toContain("## Evidence Summary");
	expect(result.document).toContain("font-size: 19px");
	expect(designIssues(result.document, evidence)).toEqual([]);
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

it("returns the canonical document without enrichment when no instrumentation is given", async () => {
	const result = await generateDesignMd(evidence);
	expect(result.enrichment.status).toBe("unavailable");
	expect(result.document).toContain("## Tokens - Colors");
	expect(designIssues(result.document, evidence)).toEqual([]);
});

it("accepts more valid references than the display cap instead of discarding them", () => {
	const many = {
		observations: Array.from({ length: 30 }, () => ({
			element: 0,
			properties: ["font-size"],
		})),
	};
	const summary = renderValidatedExplanation(many, evidence);
	expect(summary.split("\n")).toHaveLength(12);
	expect(summary).toContain("font-size: 19px");
	expect(() =>
		renderValidatedExplanation(
			{
				observations: Array.from({ length: 13 }, (_, index) =>
					index === 12
						? { element: 0, properties: ["not-observed"] }
						: { element: 0, properties: ["font-size"] },
				),
			},
			evidence,
		),
	).toThrow();
});

it("recovers a fenced JSON response without inventing observations", () => {
	expect(
		parseExplanationResponse(
			'```json\n{"observations":[{"element":0,"properties":["font-size"]}]}\n```',
		),
	).toEqual({ observations: [{ element: 0, properties: ["font-size"] }] });
	expect(
		parseExplanationResponse(
			'Here is the summary: {"observations":[{"element":0,"properties":["font-size"]}]}',
		),
	).toEqual({ observations: [{ element: 0, properties: ["font-size"] }] });
	expect(parseExplanationResponse("no json here")).toBeNull();
	expect(parseExplanationResponse("{ not valid json")).toBeNull();
});

it("applies enrichment from a fenced model response", async () => {
	stubStream(
		'```json\n{"observations":[{"element":0,"properties":["font-size"]}]}\n```',
	);
	const result = await generateDesignMd(evidence, instrumentation);
	expect(result.enrichment.status).toBe("applied");
	expect(result.document).toContain("font-size: 19px");
	expect(designIssues(result.document, evidence)).toEqual([]);
});
