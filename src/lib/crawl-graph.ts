import type { scrapePages } from "@/db/schema";

type Page = typeof scrapePages.$inferSelect;

export interface CrawlGraphNode {
	id: string;
	label: string;
	url: string;
	status: Page["status"];
	depth: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface CrawlGraphEdge {
	from: string;
	to: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface CrawlGraphLayout {
	nodes: CrawlGraphNode[];
	edges: CrawlGraphEdge[];
	width: number;
	height: number;
}

export const CRAWL_GRAPH_NODE_W = 180;
export const CRAWL_GRAPH_NODE_H = 56;
const CRAWL_GRAPH_GAP_X = 80;
const CRAWL_GRAPH_GAP_Y = 24;
const CRAWL_GRAPH_PAD = 40;
const CRAWL_GRAPH_LABEL_MAX = 28;

export function shortCrawlLabel(title: string | null, url: string): string {
	const raw = title?.trim() ? title.trim() : pathnameOf(url);
	if (raw.length <= CRAWL_GRAPH_LABEL_MAX) return raw;
	return `${raw.slice(0, CRAWL_GRAPH_LABEL_MAX)}…`;
}

function pathnameOf(url: string): string {
	try {
		const path = new URL(url).pathname;
		return path && path !== "/" ? path : url;
	} catch {
		return url;
	}
}

export function layoutCrawlGraph(pages: Page[]): CrawlGraphLayout {
	if (pages.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };
	const byDepth = new Map<number, Page[]>();
	for (const row of pages) {
		const list = byDepth.get(row.depth) ?? [];
		list.push(row);
		byDepth.set(row.depth, list);
	}
	for (const list of byDepth.values())
		list.sort((a, b) => a.url.localeCompare(b.url));
	const depths = [...byDepth.keys()].sort((a, b) => a - b);
	const maxDepth = depths[depths.length - 1] ?? 0;
	const nodes: CrawlGraphNode[] = [];
	const centers = new Map<string, { x: number; y: number }>();
	for (const depth of depths) {
		const list = byDepth.get(depth) ?? [];
		for (let i = 0; i < list.length; i++) {
			const row = list[i];
			const x =
				CRAWL_GRAPH_PAD + depth * (CRAWL_GRAPH_NODE_W + CRAWL_GRAPH_GAP_X);
			const y = CRAWL_GRAPH_PAD + i * (CRAWL_GRAPH_NODE_H + CRAWL_GRAPH_GAP_Y);
			nodes.push({
				id: row.url,
				label: shortCrawlLabel(row.title, row.url),
				url: row.url,
				status: row.status,
				depth: row.depth,
				x,
				y,
				w: CRAWL_GRAPH_NODE_W,
				h: CRAWL_GRAPH_NODE_H,
			});
			centers.set(row.url, {
				x: x + CRAWL_GRAPH_NODE_W / 2,
				y: y + CRAWL_GRAPH_NODE_H / 2,
			});
		}
	}
	const known = new Set(pages.map((row) => row.url));
	const seen = new Set<string>();
	const edges: CrawlGraphEdge[] = [];
	function pushEdge(from: string, to: string): void {
		if (!known.has(from) || !known.has(to)) return;
		const key = `${from} -> ${to}`;
		if (seen.has(key)) return;
		seen.add(key);
		const a = centers.get(from);
		const b = centers.get(to);
		if (!a || !b) return;
		edges.push({ from, to, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
	}
	for (const row of pages) {
		if (row.parentUrl) pushEdge(row.parentUrl, row.url);
		for (const target of row.content?.outgoingPages ?? [])
			pushEdge(row.url, target);
	}
	const maxLayer = Math.max(
		...[...byDepth.values()].map((list) => list.length),
		0,
	);
	const width =
		CRAWL_GRAPH_PAD * 2 +
		(maxDepth + 1) * CRAWL_GRAPH_NODE_W +
		maxDepth * CRAWL_GRAPH_GAP_X;
	const height =
		CRAWL_GRAPH_PAD * 2 +
		maxLayer * CRAWL_GRAPH_NODE_H +
		Math.max(0, maxLayer - 1) * CRAWL_GRAPH_GAP_Y;
	return { nodes, edges, width, height };
}
