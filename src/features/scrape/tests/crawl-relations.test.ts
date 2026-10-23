import { describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import {
	buildCrawlRelations,
	shortCrawlLabel,
} from "@/features/scrape/utils/crawl-relations";

type Page = typeof scrapePages.$inferSelect;

function page(
	url: string,
	parentUrl: string | null,
	depth: number,
	options?: { title?: string | null; outgoing?: string[] },
): Page {
	const outgoing = options?.outgoing ?? [];
	return {
		id: url,
		scrapeId: "scrape-1",
		userId: "owner-1",
		url,
		parentUrl,
		depth,
		status: "completed",
		title: options?.title ?? null,
		httpStatus: 200,
		content: {
			description: null,
			headings: [],
			text: "",
			links: outgoing,
			images: [],
			patterns: [],
			outgoingPages: outgoing,
		},
		error: null,
	};
}

describe("buildCrawlRelations", () => {
	it("separates discovery edges from links observed in the page HTML", () => {
		const pages = [
			page("https://example.test/", null, 0, {
				title: "Home",
				outgoing: ["https://example.test/pricing"],
			}),
			page("https://example.test/pricing", "https://example.test/", 1, {
				title: "Pricing",
				outgoing: ["https://example.test/docs"],
			}),
			page("https://example.test/docs", "https://example.test/", 1, {
				title: "Docs",
			}),
		];

		const relations = buildCrawlRelations(pages);

		expect(relations.primaryEdges).toEqual([
			{
				from: "https://example.test/",
				to: "https://example.test/pricing",
				kind: "primary",
			},
			{
				from: "https://example.test/",
				to: "https://example.test/docs",
				kind: "primary",
			},
		]);
		expect(relations.secondaryEdges).toEqual([
			{
				from: "https://example.test/pricing",
				to: "https://example.test/docs",
				kind: "cross",
			},
		]);
	});

	it("never repeats an edge that is already a discovery relationship", () => {
		const pages = [
			page("https://example.test/", null, 0, {
				outgoing: [
					"https://example.test/pricing",
					"https://example.test/pricing",
				],
			}),
			page("https://example.test/pricing", "https://example.test/", 1),
		];

		const relations = buildCrawlRelations(pages);

		expect(relations.primaryEdges).toHaveLength(1);
		expect(relations.secondaryEdges).toHaveLength(0);
	});

	it("drops self links and links to pages outside the crawl result", () => {
		const pages = [
			page("https://example.test/", null, 0, {
				outgoing: [
					"https://example.test/",
					"https://example.test/missing",
					"https://external.test/other",
				],
			}),
		];

		const relations = buildCrawlRelations(pages);

		expect(relations.primaryEdges).toHaveLength(0);
		expect(relations.secondaryEdges).toHaveLength(0);
	});

	it("keeps a page without a captured parent free of a discovery edge", () => {
		const pages = [
			page("https://example.test/", null, 0),
			page(
				"https://example.test/orphan",
				"https://example.test/never-crawled",
				1,
			),
		];

		const relations = buildCrawlRelations(pages);
		const orphan = relations.byUrl.get("https://example.test/orphan");

		expect(relations.primaryEdges).toHaveLength(0);
		expect(orphan?.foundFrom).toBeNull();
		expect(orphan?.incomingCount).toBe(0);
	});

	it("terminates on circular links and keeps every edge unique", () => {
		const pages = [
			page("https://example.test/a", "https://example.test/b", 1, {
				outgoing: ["https://example.test/b", "https://example.test/a"],
			}),
			page("https://example.test/b", "https://example.test/a", 1, {
				outgoing: ["https://example.test/a"],
			}),
		];

		const relations = buildCrawlRelations(pages);
		const keys = [...relations.primaryEdges, ...relations.secondaryEdges].map(
			(edge) => `${edge.from}->${edge.to}`,
		);

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).not.toContain(
			"https://example.test/a->https://example.test/a",
		);
	});

	it("counts discovery and observed links separately from the extra ones", () => {
		const pages = [
			page("https://example.test/", null, 0, {
				outgoing: ["https://example.test/pricing"],
			}),
			page("https://example.test/pricing", "https://example.test/", 1, {
				outgoing: ["https://example.test/docs"],
			}),
			page("https://example.test/docs", "https://example.test/", 1, {
				outgoing: ["https://example.test/pricing"],
			}),
		];

		const relations = buildCrawlRelations(pages);
		const pricing = relations.byUrl.get("https://example.test/pricing");
		const home = relations.byUrl.get("https://example.test/");

		expect(pricing?.foundFrom?.url).toBe("https://example.test/");
		expect(pricing?.foundFrom?.label).toBe("example.test");
		expect(pricing?.outgoingCount).toBe(1);
		expect(pricing?.incomingCount).toBe(2);
		expect(pricing?.additionalOutgoing.map((item) => item.url)).toEqual([
			"https://example.test/docs",
		]);
		expect(pricing?.additionalIncoming.map((item) => item.url)).toEqual([
			"https://example.test/docs",
		]);
		expect(pricing?.additionalCount).toBe(2);

		expect(home?.foundFrom).toBeNull();
		expect(home?.outgoingCount).toBe(2);
		expect(home?.incomingCount).toBe(0);
	});

	it("lists an observed link that is not a discovery parent as an extra relation", () => {
		const pages = [
			page("https://example.test/", null, 0),
			page("https://example.test/pricing", "https://example.test/", 1),
			page("https://example.test/blog", "https://example.test/", 1, {
				outgoing: ["https://example.test/pricing"],
			}),
		];

		const relations = buildCrawlRelations(pages);
		const pricing = relations.byUrl.get("https://example.test/pricing");

		expect(pricing?.additionalIncoming.map((item) => item.url)).toEqual([
			"https://example.test/blog",
		]);
		expect(pricing?.additionalCount).toBe(1);
	});

	it("marks observed links between pages of equal depth as cross links", () => {
		const pages = [
			page("https://example.test/", null, 0),
			page("https://example.test/a", "https://example.test/", 1, {
				outgoing: ["https://example.test/b"],
			}),
			page("https://example.test/b", "https://example.test/", 1),
			page("https://example.test/c", "https://example.test/", 1, {
				outgoing: ["https://example.test/deep"],
			}),
			page("https://example.test/other", "https://example.test/", 1),
			// Discovered through another page, so the link from /c is only an
			// observed link and points at a different depth.
			page("https://example.test/deep", "https://example.test/other", 2),
		];

		const relations = buildCrawlRelations(pages);

		expect(
			relations.secondaryEdges.find(
				(edge) => edge.to === "https://example.test/b",
			)?.kind,
		).toBe("cross");
		expect(
			relations.secondaryEdges.find(
				(edge) => edge.to === "https://example.test/deep",
			)?.kind,
		).toBe("secondary");
	});

	it("truncates long labels but keeps the full title for tooltips", () => {
		const long = "a".repeat(200);
		expect(
			shortCrawlLabel(long, "https://example.test/").length,
		).toBeLessThanOrEqual(29);
		expect(shortCrawlLabel("Judul lengkap", "https://example.test/")).toBe(
			"Judul lengkap",
		);
	});
});
