import { describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import { layoutCrawlGraph } from "@/features/scrape/utils/crawl-graph";

type Page = typeof scrapePages.$inferSelect;

function page(
	url: string,
	parentUrl: string | null,
	depth: number,
	options?: Partial<Page>,
): Page {
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
		...options,
	};
}

function withOutgoing(outgoing: string[]): Partial<Page> {
	return {
		content: {
			outgoingPages: outgoing,
			description: null,
			headings: [],
			text: "",
			links: [],
			images: [],
			patterns: [],
		},
	};
}

describe("layoutCrawlGraph", () => {
	it("creates nodes and primary edges with clean hierarchical positions", () => {
		const pages = [
			page("https://example.test/", null, 0, { title: "Home" }),
			page("https://example.test/pricing", "https://example.test/", 1, {
				title: "Pricing",
			}),
			page("https://example.test/docs", "https://example.test/", 1, {
				title: "Documentation",
			}),
		];
		const graph = layoutCrawlGraph(pages);
		expect(graph.nodes).toHaveLength(3);

		const root = graph.nodes.find(
			(node) => node.id === "https://example.test/",
		);
		const pricing = graph.nodes.find(
			(node) => node.id === "https://example.test/pricing",
		);
		const docs = graph.nodes.find(
			(node) => node.id === "https://example.test/docs",
		);

		expect(root).toBeDefined();
		expect(pricing).toBeDefined();
		expect(docs).toBeDefined();

		// Top-to-bottom hierarchy: parent is placed above children
		expect(root?.y).toBeLessThan(pricing?.y ?? 0);
		expect(root?.y).toBeLessThan(docs?.y ?? 0);
		expect(root?.isRoot).toBe(true);
		expect(pricing?.isRoot).toBe(false);

		// Primary edges connect parent to children
		expect(graph.primaryEdges).toHaveLength(2);
		expect(graph.secondaryEdges).toHaveLength(0);
		const primaryKeys = graph.primaryEdges.map((e) => `${e.from}->${e.to}`);
		expect(primaryKeys).toContain(
			"https://example.test/->https://example.test/pricing",
		);
		expect(primaryKeys).toContain(
			"https://example.test/->https://example.test/docs",
		);

		// Edges have valid SVG paths and endpoints
		for (const edge of graph.primaryEdges) {
			expect(edge.kind).toBe("primary");
			expect(edge.path).toMatch(/^M \d+ \d+ C/);
			expect(edge.x1).toBeGreaterThanOrEqual(0);
			expect(edge.y1).toBeGreaterThanOrEqual(0);
			expect(edge.x2).toBeGreaterThanOrEqual(0);
			expect(edge.y2).toBeGreaterThanOrEqual(0);
		}
	});

	it("keeps observed links separate from the discovery hierarchy", () => {
		const pages = [
			page("https://example.test/", null, 0, {
				title: "Home",
				...withOutgoing([
					"https://example.test/pricing",
					"https://example.test/docs",
				]),
			}),
			page("https://example.test/pricing", "https://example.test/", 1, {
				title: "Pricing",
				// Observed link between siblings, not a discovery parent
				...withOutgoing(["https://example.test/docs"]),
			}),
			page("https://example.test/docs", "https://example.test/", 1),
		];

		const graph = layoutCrawlGraph(pages);

		expect(graph.primaryEdges).toHaveLength(2);
		expect(graph.secondaryEdges).toHaveLength(1);
		expect(graph.secondaryEdges[0].kind).toBe("cross");
		expect(graph.secondaryEdges[0].from).toBe("https://example.test/pricing");
		expect(graph.secondaryEdges[0].to).toBe("https://example.test/docs");
	});

	it("does not let observed links move the pages around", () => {
		const tree = [
			page("https://example.test/", null, 0, { title: "Home" }),
			page("https://example.test/a", "https://example.test/", 1),
			page("https://example.test/b", "https://example.test/", 1),
		];
		const withObservedLinks = [
			page("https://example.test/", null, 0, { title: "Home" }),
			page("https://example.test/a", "https://example.test/", 1, {
				// Observed link to a page that was discovered elsewhere
				...withOutgoing(["https://example.test/b"]),
			}),
			page("https://example.test/b", "https://example.test/", 1),
		];

		const plain = layoutCrawlGraph(tree);
		const observed = layoutCrawlGraph(withObservedLinks);

		expect(observed.secondaryEdges.length).toBeGreaterThan(0);
		expect(observed.nodes.map((node) => [node.x, node.y])).toEqual(
			plain.nodes.map((node) => [node.x, node.y]),
		);
	});

	it("handles cycles and deduplicates edges without infinite loops", () => {
		const pages = [
			page("https://example.test/a", "https://example.test/b", 1, {
				...withOutgoing([
					"https://example.test/b",
					"https://example.test/b", // Duplicate link
					"https://example.test/a", // Self link
				]),
			}),
			page("https://example.test/b", "https://example.test/a", 1, {
				...withOutgoing(["https://example.test/a"]),
			}),
		];
		const graph = layoutCrawlGraph(pages);
		expect(graph.nodes).toHaveLength(2);
		// No self-links as chords, duplicate edges deduplicated
		const edgeKeys = [...graph.primaryEdges, ...graph.secondaryEdges].map(
			(e) => `${e.from}->${e.to}`,
		);
		const uniqueEdgeKeys = new Set(edgeKeys);
		expect(uniqueEdgeKeys.size).toBe(edgeKeys.length);
		expect(edgeKeys).not.toContain(
			"https://example.test/a->https://example.test/a",
		);
	});

	it("prevents node collisions in dense graphs with multiple siblings", () => {
		const children: Page[] = [];
		for (let i = 0; i < 8; i++) {
			children.push(
				page(`https://example.test/page-${i}`, "https://example.test/", 1),
			);
		}
		const pages = [page("https://example.test/", null, 0), ...children];
		const graph = layoutCrawlGraph(pages);
		expect(graph.nodes).toHaveLength(9);

		// Verify no two nodes overlap in 2D space
		for (let i = 0; i < graph.nodes.length; i++) {
			for (let j = i + 1; j < graph.nodes.length; j++) {
				const a = graph.nodes[i];
				const b = graph.nodes[j];
				const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
				const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
				const overlap = overlapX && overlapY;
				expect(overlap).toBe(false);
			}
		}
	});

	it("handles root-only graph and empty pages gracefully", () => {
		const empty = layoutCrawlGraph([]);
		expect(empty.nodes).toHaveLength(0);
		expect(empty.primaryEdges).toHaveLength(0);
		expect(empty.secondaryEdges).toHaveLength(0);
		expect(empty.width).toBe(0);
		expect(empty.height).toBe(0);

		const rootOnly = layoutCrawlGraph([page("https://example.test/", null, 0)]);
		expect(rootOnly.nodes).toHaveLength(1);
		expect(rootOnly.nodes[0].isRoot).toBe(true);
		expect(rootOnly.primaryEdges).toHaveLength(0);
		expect(rootOnly.width).toBeGreaterThan(0);
		expect(rootOnly.height).toBeGreaterThan(0);
	});

	it("preserves layout determinism and node stability as new pages arrive", () => {
		const basePages = [
			page("https://example.test/", null, 0),
			page("https://example.test/a", "https://example.test/", 1),
		];
		const run1 = layoutCrawlGraph(basePages);
		const run2 = layoutCrawlGraph(basePages);

		expect(run1.nodes[0].x).toBe(run2.nodes[0].x);
		expect(run1.nodes[0].y).toBe(run2.nodes[0].y);
		expect(run1.nodes[1].x).toBe(run2.nodes[1].x);
		expect(run1.nodes[1].y).toBe(run2.nodes[1].y);

		// Adding a new page does not alter the relative order of existing layers
		const expandedPages = [
			...basePages,
			page("https://example.test/b", "https://example.test/", 1),
		];
		const expanded = layoutCrawlGraph(expandedPages);
		expect(expanded.nodes).toHaveLength(3);
		const root = expanded.nodes.find((n) => n.id === "https://example.test/");
		const nodeA = expanded.nodes.find((n) => n.id === "https://example.test/a");
		const nodeB = expanded.nodes.find((n) => n.id === "https://example.test/b");

		expect(root?.y).toBeLessThan(nodeA?.y ?? 0);
		expect(root?.y).toBeLessThan(nodeB?.y ?? 0);
	});

	it("correctly models page statuses including failed and skipped pages", () => {
		const pages = [
			page("https://example.test/", null, 0),
			page("https://example.test/failed", "https://example.test/", 1, {
				status: "failed",
				error: "404 Not Found",
			}),
			page("https://example.test/skipped", "https://example.test/", 1, {
				status: "skipped",
			}),
		];
		const graph = layoutCrawlGraph(pages);
		const failed = graph.nodes.find(
			(n) => n.id === "https://example.test/failed",
		);
		const skipped = graph.nodes.find(
			(n) => n.id === "https://example.test/skipped",
		);

		expect(failed?.status).toBe("failed");
		expect(skipped?.status).toBe("skipped");
		expect(graph.primaryEdges).toHaveLength(2);
	});

	it("reports the observed link counts on every node", () => {
		const pages = [
			page("https://example.test/", null, 0, {
				...withOutgoing(["https://example.test/pricing"]),
			}),
			page("https://example.test/pricing", "https://example.test/", 1, {
				...withOutgoing(["https://example.test/docs"]),
			}),
			page("https://example.test/docs", "https://example.test/", 1),
		];

		const graph = layoutCrawlGraph(pages);
		const home = graph.nodes.find((n) => n.id === "https://example.test/");
		const pricing = graph.nodes.find(
			(n) => n.id === "https://example.test/pricing",
		);

		expect(home?.outgoingCount).toBe(2);
		expect(home?.incomingCount).toBe(0);
		expect(pricing?.outgoingCount).toBe(1);
		expect(pricing?.incomingCount).toBe(1);
	});

	it("truncates long labels for viewport readability", () => {
		const longUrl = `https://example.test/${"a".repeat(200)}`;
		const graph = layoutCrawlGraph([page(longUrl, null, 0)]);
		expect(graph.nodes[0].label.length).toBeLessThanOrEqual(32);
	});
});
