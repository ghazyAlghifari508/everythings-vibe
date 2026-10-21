import { describe, expect, it } from "vitest";
import {
	buildSynthesisInstruction,
	buildSynthesisPayload,
	classifySynthesisCause,
	designSynthesisSchema,
	enrichmentDetailForCause,
	parseSynthesisResponse,
	synthesisToRenderOptions,
	validateSynthesis,
} from "@/features/scrape/services/design-synthesis";
import { buildFixtureModel } from "@/lib/design-fixture";

const model = buildFixtureModel();

function synthesis(overrides: Record<string, unknown> = {}) {
	return {
		essence: "A measured interface.",
		overview: "Hierarchy comes from a measured type scale.",
		theme: "light" as const,
		identityNarrative: "One action colour leads the page.",
		componentPatterns: [],
		layoutPrinciples: [],
		imageryNotes: [],
		implementationGuidance: [],
		dos: [],
		donts: [],
		limitations: [],
		...overrides,
	};
}

// A minimal JSON extractor, matching the production helper's contract.
function extractJson(text: string): string {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

describe("synthesis contract", () => {
	it("tells the model to cite evidence and never invent values", () => {
		const instruction = buildSynthesisInstruction();
		expect(instruction).toMatch(/never invent/i);
		expect(instruction).toMatch(/cite evidence/i);
		expect(instruction).toMatch(/json/i);
		expect(instruction).toMatch(/responsive, hover, focus/i);
	});

	it("sends an indexed, compact view of the model it can cite", () => {
		const payload = JSON.parse(buildSynthesisPayload(model));
		expect(payload.colors[0]).toHaveProperty("index", 0);
		expect(payload.typography[0]).toHaveProperty("index", 0);
		expect(payload.spacing[0]).toHaveProperty("index", 0);
		expect(payload.radii[0]).toHaveProperty("index", 0);
	});

	it("rejects an unknown field instead of silently accepting it", () => {
		const result = designSynthesisSchema.safeParse(
			synthesis({ inventedField: "value" }),
		);
		expect(result.success).toBe(false);
	});

	it("requires every rule to cite at least one reference", () => {
		expect(
			designSynthesisSchema.safeParse(
				synthesis({ dos: [{ rule: "Do something.", references: [] }] }),
			).success,
		).toBe(false);
	});
});

describe("synthesis validation", () => {
	it("accepts a response that cites only real model entries", () => {
		const parsed = designSynthesisSchema.parse(
			synthesis({
				componentPatterns: [
					{
						name: "Action",
						description: "Solid fill.",
						references: [{ kind: "color", index: 0 }],
					},
				],
			}),
		);
		expect(validateSynthesis(parsed, model)).toEqual([]);
	});

	it("rejects a reference beyond the model's range", () => {
		const parsed = designSynthesisSchema.parse(
			synthesis({
				dos: [
					{
						rule: "Cite nothing real.",
						references: [{ kind: "color", index: 999 }],
					},
				],
			}),
		);
		const issues = validateSynthesis(parsed, model);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.code).toBe("unknown-reference");
	});

	it("rejects a colour literal the model never measured", () => {
		const parsed = designSynthesisSchema.parse(
			synthesis({ overview: "The accent is #123456 per the design." }),
		);
		const issues = validateSynthesis(parsed, model);
		expect(issues.some((issue) => issue.code === "unknown-value")).toBe(true);
	});

	it("accepts a colour literal the model did measure", () => {
		const measured = model.colors[0]?.value ?? "#000000";
		const parsed = designSynthesisSchema.parse(
			synthesis({ overview: `The measured action colour is ${measured}.` }),
		);
		expect(validateSynthesis(parsed, model)).toEqual([]);
	});

	it.each(["137px", "137%"])("rejects unmeasured CSS length %s", (value) => {
		const parsed = designSynthesisSchema.parse(
			synthesis({ implementationGuidance: [`Use a radius of ${value}.`] }),
		);
		expect(validateSynthesis(parsed, model)).toEqual([
			{
				code: "unknown-value",
				detail: `Prose cites measurement ${value}, which was not measured.`,
			},
		]);
	});

	it("accepts percentages present in measured typography", () => {
		const parsed = designSynthesisSchema.parse(
			synthesis({ implementationGuidance: ["Use a line height of 137%."] }),
		);
		expect(
			validateSynthesis(parsed, {
				...model,
				typography: model.typography.map((entry) => ({
					...entry,
					lineHeight: "137%",
				})),
			}),
		).toEqual([]);
	});
});

describe("synthesis parsing", () => {
	it("applies a valid response", () => {
		const outcome = parseSynthesisResponse(
			JSON.stringify(synthesis()),
			model,
			extractJson,
		);
		expect(outcome.status).toBe("applied");
		expect(outcome.synthesis).not.toBeNull();
	});

	it("recovers a fenced response", () => {
		const outcome = parseSynthesisResponse(
			`\`\`\`json\n${JSON.stringify(synthesis())}\n\`\`\``,
			model,
			extractJson,
		);
		expect(outcome.status).toBe("applied");
	});

	it("degrades to unavailable on prose that is not JSON", () => {
		const outcome = parseSynthesisResponse(
			"no json at all",
			model,
			extractJson,
		);
		expect(outcome.status).toBe("unavailable");
		expect(outcome.detail).toMatch(/json/i);
	});

	it("degrades to unavailable when the schema is not met", () => {
		const outcome = parseSynthesisResponse(
			JSON.stringify({ essence: "too little" }),
			model,
			extractJson,
		);
		expect(outcome.status).toBe("unavailable");
		expect(outcome.detail).toMatch(/kontrak/i);
	});

	it("degrades to unavailable when a citation is invented", () => {
		const outcome = parseSynthesisResponse(
			JSON.stringify(
				synthesis({
					dos: [
						{
							rule: "Invented rule.",
							references: [{ kind: "radius", index: 42 }],
						},
					],
				}),
			),
			model,
			extractJson,
		);
		expect(outcome.status).toBe("unavailable");
	});
});

describe("synthesis failure causes", () => {
	it("codes a stall or budget timeout distinctly from a provider error", () => {
		expect(
			classifySynthesisCause(
				new Error("AI tidak merespons dalam 2 menit. Coba generate ulang."),
			),
		).toBe("timeout");
		expect(
			classifySynthesisCause(
				new Error("Generasi melebihi batas waktu. Coba lagi."),
			),
		).toBe("timeout");
		expect(classifySynthesisCause(new Error("upstream 500"))).toBe("provider");
	});

	it("codes an aborted job as cancelled", () => {
		const controller = new AbortController();
		controller.abort();
		expect(
			classifySynthesisCause(new Error("AI stream aborted"), controller.signal),
		).toBe("cancelled");
		expect(classifySynthesisCause(new Error("Generation dibatalkan."))).toBe(
			"cancelled",
		);
	});

	it("never leaks the raw provider message into the stored detail", () => {
		const detail = enrichmentDetailForCause(
			"provider",
			"upstream 500: secret-key project-123 exploded",
		);
		expect(detail).not.toContain("upstream 500");
		expect(detail).not.toContain("secret-key");
		expect(detail.trim().length).toBeGreaterThan(0);
	});

	it("explains a timeout without the raw watchdog text", () => {
		const detail = enrichmentDetailForCause(
			"timeout",
			"AI tidak merespons dalam 2 menit.",
		);
		expect(detail).toMatch(/batas waktu|timeout/i);
	});
});

describe("synthesis to renderer mapping", () => {
	it("turns each citation into a readable evidence string", () => {
		const parsed = designSynthesisSchema.parse(
			synthesis({
				componentPatterns: [
					{
						name: "Action button",
						description: "Solid fill.",
						references: [
							{ kind: "color", index: 0 },
							{ kind: "radius", index: 0 },
						],
					},
				],
			}),
		);
		const options = synthesisToRenderOptions(parsed, model);
		const evidence = options.componentPatterns?.[0]?.evidence ?? "";
		expect(evidence).toContain(model.colors[0]?.value ?? "");
		expect(evidence).toContain(model.radii[0]?.value ?? "");
	});

	it("carries the prose through to the renderer unchanged", () => {
		const parsed = designSynthesisSchema.parse(
			synthesis({ essence: "A measured interface." }),
		);
		const options = synthesisToRenderOptions(parsed, model);
		expect(options.essence).toBe("A measured interface.");
		expect(options.layoutPrinciples).toEqual([]);
	});

	it("preserves synthesis limitations separately from measured facts", () => {
		const parsed = designSynthesisSchema.parse(
			synthesis({ limitations: ["Additional states remain unknown."] }),
		);
		expect(synthesisToRenderOptions(parsed, model).limitations).toEqual(
			parsed.limitations,
		);
	});
});
