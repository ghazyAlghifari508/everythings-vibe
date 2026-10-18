import dagre from "dagre";
import type { scrapePages } from "@/db/schema";

type Page = typeof scrapePages.$inferSelect;

export type CrawlEdgeKind = "primary" | "secondary" | "cross";

export interface CrawlGraphNode {
	id: string;
	label: string;
	url: string;
	status: Page["status"];
	depth: number;
	httpStatus: number | null;
	title: string | null;
	isRoot: boolean;
	parentUrl: string | null;
	incomingCount: number;
	outgoingCount: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface CrawlGraphEdge {
	from: string;
	to: string;
	kind: CrawlEdgeKind;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	points: { x: number; y: number }[];
	path: string;
}

export interface CrawlGraphLayout {
	nodes: CrawlGraphNode[];
	edges: CrawlGraphEdge[];
	primaryEdges: CrawlGraphEdge[];
	secondaryEdges: CrawlGraphEdge[];
	width: number;
	height: number;
}

export interface CrawlLayoutOptions {
	viewMode?: "discovery" | "all";
	rankdir?: "TB" | "LR";
	nodeWidth?: number;
	nodeHeight?: number;
}

export const CRAWL_GRAPH_NODE_W = 200;
export const CRAWL_GRAPH_NODE_H = 64;
export const CRAWL_GRAPH_GAP_X = 48;
export const CRAWL_GRAPH_GAP_Y = 64;
export const CRAWL_GRAPH_PAD = 48;
export const CRAWL_GRAPH_LABEL_MAX = 28;

export function shortCrawlLabel(title: string | null, url: string): string {
	const raw = title?.trim() ? title.trim() : pathnameOf(url);
	if (raw.length <= CRAWL_GRAPH_LABEL_MAX) return raw;
	return `${raw.slice(0, CRAWL_GRAPH_LABEL_MAX)}…`;
}

export function pathnameOf(url: string): string {
	try {
		const parsed = new URL(url);
		const path = parsed.pathname;
		if (path === "/" || !path) {
			return parsed.hostname;
		}
		return path;
	} catch {
		return url;
	}
}

function buildCubicPath(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	rankdir: "TB" | "LR",
): string {
	if (rankdir === "TB") {
		const midY = (y1 + y2) / 2;
		return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
	}
	const midX = (x1 + x2) / 2;
	return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

export function layoutCrawlGraph(
	pages: Page[],
	options?: CrawlLayoutOptions,
): CrawlGraphLayout {
	if (pages.length === 0) {
		return {
			nodes: [],
			edges: [],
			primaryEdges: [],
			secondaryEdges: [],
			width: 0,
			height: 0,
		};
	}

	const rankdir = options?.rankdir ?? "TB";
	const viewMode = options?.viewMode ?? "discovery";
	const nodeW = options?.nodeWidth ?? CRAWL_GRAPH_NODE_W;
	const nodeH = options?.nodeHeight ?? CRAWL_GRAPH_NODE_H;

	const known = new Set(pages.map((p) => p.url));
	const incomingCounts = new Map<string, number>();
	const outgoingCounts = new Map<string, number>();

	for (const p of pages) {
		incomingCounts.set(p.url, 0);
		outgoingCounts.set(p.url, 0);
	}

	// 1. Identify primary discovery edges (child discovered by parent)
	const primaryEdgeSet = new Set<string>();
	const primaryEdgesRaw: { from: string; to: string }[] = [];

	for (const row of pages) {
		if (
			row.parentUrl &&
			known.has(row.parentUrl) &&
			row.parentUrl !== row.url
		) {
			const key = `${row.parentUrl} -> ${row.url}`;
			if (!primaryEdgeSet.has(key)) {
				primaryEdgeSet.add(key);
				primaryEdgesRaw.push({ from: row.parentUrl, to: row.url });
			}
		}
	}

	// 2. Identify secondary observed links & cross-links
	const secondaryEdgeSet = new Set<string>();
	const secondaryEdgesRaw: { from: string; to: string; isCross: boolean }[] =
		[];

	for (const row of pages) {
		const targets = row.content?.outgoingPages ?? [];
		for (const target of targets) {
			if (!known.has(target) || target === row.url) continue;
			const key = `${row.url} -> ${target}`;
			if (primaryEdgeSet.has(key) || secondaryEdgeSet.has(key)) continue;
			secondaryEdgeSet.add(key);

			const targetRow = pages.find((p) => p.url === target);
			const isCross = targetRow ? targetRow.depth === row.depth : false;
			secondaryEdgesRaw.push({ from: row.url, to: target, isCross });
		}
	}

	// Update incoming and outgoing connection counts
	for (const e of primaryEdgesRaw) {
		outgoingCounts.set(e.from, (outgoingCounts.get(e.from) ?? 0) + 1);
		incomingCounts.set(e.to, (incomingCounts.get(e.to) ?? 0) + 1);
	}
	for (const e of secondaryEdgesRaw) {
		outgoingCounts.set(e.from, (outgoingCounts.get(e.from) ?? 0) + 1);
		incomingCounts.set(e.to, (incomingCounts.get(e.to) ?? 0) + 1);
	}

	// 3. Initialize Dagre graph layout
	const g = new dagre.graphlib.Graph({ multigraph: false, compound: false });
	g.setGraph({
		rankdir,
		nodesep: CRAWL_GRAPH_GAP_X,
		ranksep: CRAWL_GRAPH_GAP_Y,
		marginx: CRAWL_GRAPH_PAD,
		marginy: CRAWL_GRAPH_PAD,
	});
	g.setDefaultEdgeLabel(() => ({}));

	// Stable deterministic order: sort by depth ascending, then by URL
	const sortedPages = [...pages].sort((a, b) => {
		if (a.depth !== b.depth) return a.depth - b.depth;
		return a.url.localeCompare(b.url);
	});

	for (const p of sortedPages) {
		g.setNode(p.url, { width: nodeW, height: nodeH });
	}

	// Primary edges determine the hierarchical layout
	for (const e of primaryEdgesRaw) {
		g.setEdge(e.from, e.to, { weight: 10, minlen: 1 });
	}

	// Compute positions via Sugiyama layered layout
	dagre.layout(g);

	// 4. Build output nodes
	const nodes: CrawlGraphNode[] = [];
	const nodeMap = new Map<string, CrawlGraphNode>();

	for (const row of sortedPages) {
		const dNode = g.node(row.url);
		const x = Math.round(dNode ? dNode.x - nodeW / 2 : CRAWL_GRAPH_PAD);
		const y = Math.round(dNode ? dNode.y - nodeH / 2 : CRAWL_GRAPH_PAD);
		const isRoot = row.depth === 0 || !row.parentUrl;

		const node: CrawlGraphNode = {
			id: row.url,
			label: shortCrawlLabel(row.title, row.url),
			url: row.url,
			status: row.status,
			depth: row.depth,
			httpStatus: row.httpStatus,
			title: row.title,
			isRoot,
			parentUrl: row.parentUrl,
			incomingCount: incomingCounts.get(row.url) ?? 0,
			outgoingCount: outgoingCounts.get(row.url) ?? 0,
			x,
			y,
			w: nodeW,
			h: nodeH,
		};
		nodes.push(node);
		nodeMap.set(row.url, node);
	}

	// 5. Build primary edges with routed coordinates
	const primaryEdges: CrawlGraphEdge[] = [];
	for (const e of primaryEdgesRaw) {
		const source = nodeMap.get(e.from);
		const target = nodeMap.get(e.to);
		if (!source || !target) continue;

		const dEdge = g.edge(e.from, e.to);
		let x1: number;
		let y1: number;
		let x2: number;
		let y2: number;
		let points: { x: number; y: number }[] = [];

		if (dEdge?.points && dEdge.points.length >= 2) {
			points = dEdge.points.map((pt) => ({
				x: Math.round(pt.x),
				y: Math.round(pt.y),
			}));
			x1 = points[0].x;
			y1 = points[0].y;
			x2 = points[points.length - 1].x;
			y2 = points[points.length - 1].y;
		} else {
			if (rankdir === "TB") {
				x1 = Math.round(source.x + source.w / 2);
				y1 = Math.round(source.y + source.h);
				x2 = Math.round(target.x + target.w / 2);
				y2 = Math.round(target.y);
			} else {
				x1 = Math.round(source.x + source.w);
				y1 = Math.round(source.y + source.h / 2);
				x2 = Math.round(target.x);
				y2 = Math.round(target.y + target.h / 2);
			}
			points = [
				{ x: x1, y: y1 },
				{ x: x2, y: y2 },
			];
		}

		primaryEdges.push({
			from: e.from,
			to: e.to,
			kind: "primary",
			x1,
			y1,
			x2,
			y2,
			points,
			path: buildCubicPath(x1, y1, x2, y2, rankdir),
		});
	}

	// 6. Build secondary edges
	const secondaryEdges: CrawlGraphEdge[] = [];
	for (const e of secondaryEdgesRaw) {
		const source = nodeMap.get(e.from);
		const target = nodeMap.get(e.to);
		if (!source || !target) continue;

		let x1: number;
		let y1: number;
		let x2: number;
		let y2: number;

		if (rankdir === "TB") {
			if (source.y < target.y) {
				x1 = Math.round(source.x + source.w / 2);
				y1 = Math.round(source.y + source.h);
				x2 = Math.round(target.x + target.w / 2);
				y2 = Math.round(target.y);
			} else if (source.y > target.y) {
				x1 = Math.round(source.x + source.w / 2);
				y1 = Math.round(source.y);
				x2 = Math.round(target.x + target.w / 2);
				y2 = Math.round(target.y + target.h);
			} else {
				// Same level cross-link
				const sourceIsLeft = source.x < target.x;
				x1 = Math.round(sourceIsLeft ? source.x + source.w : source.x);
				y1 = Math.round(source.y + source.h / 2);
				x2 = Math.round(sourceIsLeft ? target.x : target.x + target.w);
				y2 = Math.round(target.y + target.h / 2);
			}
		} else {
			x1 = Math.round(source.x + source.w);
			y1 = Math.round(source.y + source.h / 2);
			x2 = Math.round(target.x);
			y2 = Math.round(target.y + target.h / 2);
		}

		const points = [
			{ x: x1, y: y1 },
			{ x: x2, y: y2 },
		];

		secondaryEdges.push({
			from: e.from,
			to: e.to,
			kind: e.isCross ? "cross" : "secondary",
			x1,
			y1,
			x2,
			y2,
			points,
			path: buildCubicPath(x1, y1, x2, y2, rankdir),
		});
	}

	// 7. Calculate bounded layout size
	const gInfo = g.graph();
	const dagreWidth = Math.round(gInfo.width ?? 0);
	const dagreHeight = Math.round(gInfo.height ?? 0);

	const maxX = Math.max(...nodes.map((n) => n.x + n.w), 0);
	const maxY = Math.max(...nodes.map((n) => n.y + n.h), 0);

	const width = Math.max(dagreWidth, maxX + CRAWL_GRAPH_PAD);
	const height = Math.max(dagreHeight, maxY + CRAWL_GRAPH_PAD);

	const edges =
		viewMode === "all" ? [...primaryEdges, ...secondaryEdges] : primaryEdges;

	return {
		nodes,
		edges,
		primaryEdges,
		secondaryEdges,
		width,
		height,
	};
}
