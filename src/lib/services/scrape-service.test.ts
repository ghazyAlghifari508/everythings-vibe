import { describe, expect, it } from "vitest";
import {
	buildDesignMdPrompt,
	DESIGN_MIN_CHARS,
	DESIGN_REQUIRED_HEADINGS,
	DESIGN_SYSTEM_PROMPT,
	designIssues,
} from "@/lib/prompts-design-md";

describe("Scrape Prompt Builder", () => {
	it("builds 12,000+ character depth system prompt with token tables", () => {
		const prompt = buildDesignMdPrompt(
			"https://linear.app",
			"<html><body><header>Linear</header></html>",
		);
		expect(prompt).toContain("Tokens - Colors");
		expect(prompt).toContain("Tokens - Typography");
		expect(prompt).toContain("Tokens - Spacing & Shapes");
		expect(prompt).toContain("Tailwind v4");
	});

	it("covers every required DESIGN.md heading in the system prompt", () => {
		for (const heading of DESIGN_REQUIRED_HEADINGS) {
			expect(DESIGN_SYSTEM_PROMPT).toContain(heading);
		}
		expect(DESIGN_MIN_CHARS).toBe(12_000);
	});

	it("rejects thin DESIGN.md output", () => {
		expect(designIssues("# Tipis")).toContain("missing ## Tokens - Colors");
	});
});

describe("Mode-Specific Scrape Status & Progress Contracts", () => {
	it("calculates distinct progress stages for html mode and design mode", async () => {
		const { scrapeProgressForStatus } = await import("@/db/schema");

		// design mode progress stages
		expect(scrapeProgressForStatus("queued", "design")).toBe(10);
		expect(scrapeProgressForStatus("capturing", "design")).toBe(30);
		expect(scrapeProgressForStatus("extracting", "design")).toBe(55);
		expect(scrapeProgressForStatus("generating", "design")).toBe(80);
		expect(scrapeProgressForStatus("saving", "design")).toBe(95);
		expect(scrapeProgressForStatus("completed", "design")).toBe(100);

		// html mode skips generating stage and reaches higher progress earlier
		expect(scrapeProgressForStatus("queued", "html")).toBe(15);
		expect(scrapeProgressForStatus("capturing", "html")).toBe(40);
		expect(scrapeProgressForStatus("extracting", "html")).toBe(75);
		expect(scrapeProgressForStatus("saving", "html")).toBe(95);
		expect(scrapeProgressForStatus("completed", "html")).toBe(100);
	});

	it("provides mode-specific Indonesian status labels", async () => {
		const { HTML_SCRAPE_STATUS_LABELS, SCRAPE_STATUS_LABELS } = await import(
			"@/db/schema"
		);

		expect(SCRAPE_STATUS_LABELS.generating).toBe("Menyusun DESIGN.md");
		expect(HTML_SCRAPE_STATUS_LABELS.extracting).toBe("Menyiapkan preview");
		expect(HTML_SCRAPE_STATUS_LABELS.saving).toBe("Menyimpan index.html");
	});
});
