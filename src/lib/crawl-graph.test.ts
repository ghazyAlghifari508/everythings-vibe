import { describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import { layoutCrawlGraph } from "./crawl-graph";

type Page = typeof scrapePages.$inferSelect;

function page(url: string, parentUrl: string | null, depth: number): Page {
	return {
		id: url,
		scrapeId: "scrape-1",
		userId: "owner-1",
		url,
		parentUrl,
		depth,
		status: "completed",
		title: null,
		httpStatus: 200,
		content: null,
		error: null,
	};
}

describe("layoutCrawlGraph", () => {
	it("layers nodes by depth and deduplicates edges", () => {
		const pages = [
			page("https://example.test/", null, 0),
			page("https://example.test/pricing", "https://example.test/", 1),
			page("https://example.test/docs", "https://example.test/", 1),
		];
		const graph = layoutCrawlGraph(pages);
		expect(graph.nodes).toHaveLength(3);
		const root = graph.nodes.find(
			(node) => node.id === "https://example.test/",
		);
		const pricing = graph.nodes.find(
			(node) => node.id === "https://example.test/pricing",
		);
		expect(root?.x).toBeLessThan(pricing?.x ?? 0);
		expect(graph.edges.length).toBeGreaterThanOrEqual(2);
		const keys = graph.edges.map((edge) => `${edge.from}->${edge.to}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("handles cycles without hanging and keeps all nodes", () => {
		const pages = [
			page("https://example.test/a", "https://example.test/b", 1),
			page("https://example.test/b", "https://example.test/a", 1),
		];
		const graph = layoutCrawlGraph(pages);
		expect(graph.nodes).toHaveLength(2);
		expect(graph.edges.length).toBeLessThanOrEqual(2);
	});

	it("truncates long labels for viewport stability", () => {
		const longUrl = `https://example.test/${"a".repeat(200)}`;
		const graph = layoutCrawlGraph([page(longUrl, null, 0)]);
		expect(graph.nodes[0].label.length).toBeLessThanOrEqual(32);
		expect(graph.width).toBeGreaterThan(0);
		expect(graph.height).toBeGreaterThan(0);
	});
});
