import { expect, it } from "vitest";
import type { VisualEvidence } from "./design-visual-evidence";
import {
	designIssues,
	generateDesignMd,
	normalizeDesign,
	renderValidatedExplanation,
} from "./prompts-design-md";

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
	const document = await generateDesignMd(evidence);
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
	const document = await generateDesignMd(evidence);
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
