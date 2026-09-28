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
