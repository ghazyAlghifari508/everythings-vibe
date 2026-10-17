import { describe, expect, it } from "vitest";
import {
	inspectorFromModel,
	parseDesignMd,
} from "@/features/scrape/utils/design-md-inspector";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import { buildFixtureModel } from "@/lib/design-fixture";

// The document and the Style Inspector must describe the same measurements. This
// test is the contract that keeps them from drifting apart: both renderers read
// the one validated model.
describe("document and inspector consistency", () => {
	const model = buildFixtureModel();
	const document = renderDesignMd(model);
	const inspector = inspectorFromModel(model, "observed");

	it("shows the same colour values in both renderers", () => {
		for (const color of inspector.colors)
			expect(document).toContain(color.value);
	});

	it("shows the same type scale in both renderers", () => {
		for (const entry of inspector.typography) {
			expect(document).toContain(entry.size);
			expect(document).toContain(entry.role);
		}
	});

	it("shows the same font data in both renderers", () => {
		for (const typeface of inspector.typefaces) {
			expect(document).toContain(typeface.family);
			for (const weight of typeface.weights) expect(document).toContain(weight);
		}
	});

	it("shows the same spacing and radius tokens in both renderers", () => {
		for (const token of inspector.spacing) {
			expect(document).toContain(token.value);
			expect(document).toContain(token.label);
		}
		for (const token of inspector.radii) {
			expect(document).toContain(token.value);
			expect(document).toContain(token.label);
		}
	});

	it("shows the same guidance in both renderers", () => {
		for (const rule of inspector.dos) {
			expect(document).toContain(rule.rule);
			expect(document).toContain(rule.evidence);
		}
		for (const rule of inspector.donts) {
			expect(document).toContain(rule.rule);
			expect(document).toContain(rule.evidence);
		}
	});

	it("shows the same surfaces and elevation in both renderers", () => {
		for (const surface of inspector.surfaces)
			expect(document).toContain(surface.value);
		for (const token of inspector.elevation)
			expect(document).toContain(token.value);
	});

	it("reports the same limitations in both renderers", () => {
		for (const limitation of inspector.limitations)
			expect(document).toContain(limitation);
	});

	it("never presents an inferred role as a measured value", () => {
		for (const color of inspector.colors) {
			if (color.confidence !== "observed") continue;
			// An observed value must be a literal the capture produced.
			expect(color.value).toMatch(/^#[0-9a-f]{6}$|^rgba\(/i);
		}
	});

	it("keeps measured tokens identical with or without AI enrichment", () => {
		const enriched = renderDesignMd(model, {
			essence: "Enriched overview.",
			overview: "Enriched narrative.",
		});
		const fallback = renderDesignMd(model, { enrichmentUnavailable: true });
		const parsedEnriched = parseDesignMd(enriched);
		const parsedFallback = parseDesignMd(fallback);
		expect(parsedFallback.spacing.map((token) => token.value)).toEqual(
			parsedEnriched.spacing.map((token) => token.value),
		);
		expect(parsedFallback.radii.map((token) => token.value)).toEqual(
			parsedEnriched.radii.map((token) => token.value),
		);
		expect(parsedFallback.surfaces.map((surface) => surface.value)).toEqual(
			parsedEnriched.surfaces.map((surface) => surface.value),
		);
		expect(parsedFallback.components.map((item) => item.name)).toEqual(
			parsedEnriched.components.map((item) => item.name),
		);
	});
});

describe("archived document fallback", () => {
	it("labels a parsed archive as unverified rather than observed", () => {
		const archived = [
			"# Acme - Style Reference",
			"",
			"**Theme:** light",
			"",
			"## Tokens - Colors",
			"| Name | Value | Token | Role |",
			"| --- | --- | --- | --- |",
			"| Ink | #101828 | --color-ink | Primary text |",
		].join("\n");
		const parsed = parseDesignMd(archived);
		expect(parsed.verification).toBe("unverified");
		expect(parsed.colors[0]?.value).toBe("#101828");
		// A parsed archive never claims measurement provenance it cannot have.
		expect(parsed.colors[0]?.frequency).toBe(0);
		expect(parsed.colors[0]?.rationale).toBe("");
	});

	it("keeps old rows readable instead of failing to open", () => {
		const archived = [
			"# Legacy - Style Reference",
			"",
			"## Tokens - Spacing & Shapes",
			"Base unit: 4px.",
			"",
			"| Token | Value |",
			"| --- | --- |",
			"| space-1 | 4px |",
			"",
			"| Radius | Value |",
			"| --- | --- |",
			"| radius-md | 8px |",
		].join("\n");
		const parsed = parseDesignMd(archived);
		expect(parsed.baseUnitPx).toBe(4);
		expect(parsed.spacing.length).toBeGreaterThan(0);
		expect(parsed.radii.length).toBeGreaterThan(0);
	});

	it("returns an empty model for an empty archive instead of throwing", () => {
		const parsed = parseDesignMd("");
		expect(parsed.colors).toEqual([]);
		expect(parsed.verification).toBe("unverified");
	});
});
