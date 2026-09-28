import { describe, expect, it } from "vitest";
import {
	type TemplateCategory,
	type VibeTemplateEntry,
	VIBE_TEMPLATES,
	getTemplatesByCategory,
	searchTemplates,
} from "./template-gallery";

describe("VIBE_TEMPLATES Catalog", () => {
	it("contains all three required categories with minimum quotas", () => {
		const planning = getTemplatesByCategory("planning");
		const design = getTemplatesByCategory("design");
		const boilerplate = getTemplatesByCategory("boilerplate");

		expect(planning.length).toBeGreaterThanOrEqual(6);
		expect(design.length).toBeGreaterThanOrEqual(6);
		expect(boilerplate.length).toBeGreaterThanOrEqual(4);
	});

	it("ensures every template prompt is comprehensive and detailed (>100 characters)", () => {
		for (const t of VIBE_TEMPLATES) {
			expect(t.prompt.length).toBeGreaterThan(100);
			expect(t.title).toBeTruthy();
			expect(t.description).toBeTruthy();
			expect(t.tags.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("contains specific required domain templates", () => {
		const ids = VIBE_TEMPLATES.map((t) => t.id);
		expect(ids).toContain("simrs-hospital");
		expect(ids).toContain("b2b-saas-starter");
		expect(ids).toContain("ecommerce-storefront");
		expect(ids).toContain("saas-analytics");
	});

	it("searches templates by keyword across title, tags, and description", () => {
		const results = searchTemplates("hospital");
		expect(results.some((r) => r.id === "simrs-hospital")).toBe(true);
	});

	it("keeps category values within the typed union", () => {
		const categories = new Set<TemplateCategory>(
			VIBE_TEMPLATES.map((t: VibeTemplateEntry) => t.category),
		);
		expect([...categories].sort()).toEqual([
			"boilerplate",
			"design",
			"planning",
		]);
	});
});
