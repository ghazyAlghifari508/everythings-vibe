import { describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import { buildWebsiteBlueprint } from "./crawl-blueprint";

type Page = typeof scrapePages.$inferSelect;

function page(overrides: Partial<Page> & { id: string; url: string }): Page {
	return {
		scrapeId: "scrape-1",
		userId: "owner-1",
		parentUrl: null,
		depth: 0,
		status: "completed",
		title: null,
		httpStatus: 200,
		content: null,
		error: null,
		...overrides,
	};
}

describe("buildWebsiteBlueprint", () => {
	it("follows the structured outline with honest summary", () => {
		const pages: Page[] = [
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				depth: 0,
				content: {
					description: "Home description",
					headings: ["Home"],
					text: "Home body",
					links: ["https://example.test/pricing"],
					images: [],
					patterns: ["nav"],
					headingLevels: [{ level: 1, text: "Home" }],
					sections: [{ title: "Home", level: 1, text: "Home body" }],
					internalLinks: ["https://example.test/pricing"],
					externalLinks: [],
					outgoingPages: ["https://example.test/pricing"],
				},
			}),
			page({
				id: "b",
				url: "https://example.test/pricing",
				parentUrl: "https://example.test/",
				depth: 1,
				title: "Pricing",
				content: {
					description: null,
					headings: [],
					text: "Pricing body",
					links: [],
					images: [],
					patterns: [],
					headingLevels: [],
					sections: [{ title: null, level: null, text: "Pricing body" }],
					internalLinks: [],
					externalLinks: [],
					outgoingPages: [],
				},
			}),
			page({
				id: "c",
				url: "https://example.test/blocked",
				depth: 1,
				status: "skipped",
				title: null,
				httpStatus: null,
				content: null,
				error: "Dibatasi robots.txt.",
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
			scope: { maxPages: 20, maxDepth: 2 },
			capturedAt: "2026-10-12T00:00:00.000Z",
		});
		for (const heading of [
			"# Website Blueprint",
			"## Crawl Summary",
			"## Coverage & Limitations",
			"## Verified Page Inventory",
			"## Observed Link Relationships",
			"## Page Analysis",
			"## Failed & Skipped Pages",
			"## Evidence & Interpretation Boundary",
		])
			expect(markdown).toContain(heading);
		expect(markdown).not.toMatch(/12 found.*entire website/i);
		expect(markdown).toContain("https://example.test/pricing");
		expect(markdown).toContain("Dibatasi robots.txt.");
	});

	it("escapes markdown table pipes and reflects persisted pages only", () => {
		const pages: Page[] = [
			page({
				id: "a",
				url: "https://example.test/a|b",
				title: "A | B",
				content: {
					description: null,
					headings: [],
					text: "Body",
					links: [],
					images: [],
					patterns: [],
				},
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		expect(markdown).toContain("A \\| B");
		expect(markdown).toContain("https://example.test/a|b");
	});

	it("deduplicates relationships and handles cycles without hanging", () => {
		const pages: Page[] = [
			page({
				id: "a",
				url: "https://example.test/a",
				title: "A",
				content: {
					description: null,
					headings: [],
					text: "A",
					links: ["https://example.test/b"],
					images: [],
					patterns: [],
					outgoingPages: ["https://example.test/b", "https://example.test/b"],
				},
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				parentUrl: "https://example.test/a",
				depth: 1,
				title: "B",
				content: {
					description: null,
					headings: [],
					text: "B",
					links: ["https://example.test/a"],
					images: [],
					patterns: [],
					outgoingPages: ["https://example.test/a"],
				},
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const occurrences = markdown.match(
			/https:\/\/example\.test\/a.*https:\/\/example\.test\/b|https:\/\/example\.test\/b.*https:\/\/example\.test\/a/g,
		);
		expect(occurrences).not.toBeNull();
		expect(markdown.length).toBeLessThan(20000);
	});
});
