import dagre from "dagre";
import type { scrapePages } from "@/db/schema";
import {
	buildCrawlRelations,
	type CrawlRelationKind,
	type CrawlRelations,
	shortCrawlLabel,
} from "./crawl-relations";

type Page = typeof scrapePages.$inferSelect;

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
	kind: CrawlRelationKind;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	points: { x: number; y: number }[];
	path: string;
}

export interface CrawlGraphLayout {
	nodes: CrawlGraphNode[];
	/** Edges that mirror the crawler's discovery parent relationship. */
	primaryEdges: CrawlGraphEdge[];
	/** Edges for links observed in the page HTML outside the discovery tree. */
	secondaryEdges: CrawlGraphEdge[];
	/** Per-page relationship summary derived from the same observed edges. */
	relations: CrawlRelations;
	width: number;
	height: number;
}

export interface CrawlLayoutOptions {
	rankdir?: "TB" | "LR";
	nodeWidth?: number;
	nodeHeight?: number;
}

export const CRAWL_GRAPH_NODE_W = 200;
export const CRAWL_GRAPH_NODE_H = 64;
export const CRAWL_GRAPH_GAP_X = 48;
export const CRAWL_GRAPH_GAP_Y = 64;
export const CRAWL_GRAPH_PAD = 48;

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

/**
 * Places the crawled pages on a canvas.
 *
 * The layout is driven by the discovery edges only, so the picture shows the
 * hierarchy the crawler actually walked. Observed links are routed afterwards
 * and never influence the placement, because they carry no hierarchy.
 */
export function layoutCrawlGraph(
	pages: Page[],
	options?: CrawlLayoutOptions,
): CrawlGraphLayout {
	if (pages.length === 0) {
		return {
			nodes: [],
			primaryEdges: [],
			secondaryEdges: [],
			relations: { primaryEdges: [], secondaryEdges: [], byUrl: new Map() },
			width: 0,
			height: 0,
		};
	}

	const rankdir = options?.rankdir ?? "TB";
	const nodeW = options?.nodeWidth ?? CRAWL_GRAPH_NODE_W;
	const nodeH = options?.nodeHeight ?? CRAWL_GRAPH_NODE_H;

	const relations = buildCrawlRelations(pages);

	// Stable deterministic order: sort by depth ascending, then by URL
	const sortedPages = [...pages].sort((a, b) => {
		if (a.depth !== b.depth) return a.depth - b.depth;
		return a.url.localeCompare(b.url);
	});

	const g = new dagre.graphlib.Graph({ multigraph: false, compound: false });
	g.setGraph({
		rankdir,
		nodesep: CRAWL_GRAPH_GAP_X,
		ranksep: CRAWL_GRAPH_GAP_Y,
		marginx: CRAWL_GRAPH_PAD,
		marginy: CRAWL_GRAPH_PAD,
	});
	g.setDefaultEdgeLabel(() => ({}));

	for (const p of sortedPages) {
		g.setNode(p.url, { width: nodeW, height: nodeH });
	}

	// Primary edges determine the hierarchical layout
	for (const e of relations.primaryEdges) {
		g.setEdge(e.from, e.to, { weight: 10, minlen: 1 });
	}

	dagre.layout(g);

	const nodes: CrawlGraphNode[] = [];
	const nodeMap = new Map<string, CrawlGraphNode>();

	for (const row of sortedPages) {
		const dNode = g.node(row.url);
		const x = Math.round(dNode ? dNode.x - nodeW / 2 : CRAWL_GRAPH_PAD);
		const y = Math.round(dNode ? dNode.y - nodeH / 2 : CRAWL_GRAPH_PAD);
		const isRoot = row.depth === 0 || !row.parentUrl;
		const pageRelations = relations.byUrl.get(row.url);

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
			incomingCount: pageRelations?.incomingCount ?? 0,
			outgoingCount: pageRelations?.outgoingCount ?? 0,
			x,
			y,
			w: nodeW,
			h: nodeH,
		};
		nodes.push(node);
		nodeMap.set(row.url, node);
	}

	const primaryEdgePoints = new Map<string, { x: number; y: number }[]>();
	for (const e of relations.primaryEdges) {
		const dEdge = g.edge(e.from, e.to);
		const raw = dEdge?.points ?? [];
		primaryEdgePoints.set(
			`${e.from} -> ${e.to}`,
			raw.map((pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y) })),
		);
	}

	const primaryEdges = buildPrimaryEdges(
		relations.primaryEdges,
		nodeMap,
		primaryEdgePoints,
		rankdir,
	);
	const secondaryEdges = buildSecondaryEdges(
		relations.secondaryEdges,
		nodeMap,
		rankdir,
	);

	const gInfo = g.graph();
	const dagreWidth = Math.round(gInfo.width ?? 0);
	const dagreHeight = Math.round(gInfo.height ?? 0);

	const maxX = Math.max(...nodes.map((n) => n.x + n.w), 0);
	const maxY = Math.max(...nodes.map((n) => n.y + n.h), 0);

	const width = Math.max(dagreWidth, maxX + CRAWL_GRAPH_PAD);
	const height = Math.max(dagreHeight, maxY + CRAWL_GRAPH_PAD);

	return {
		nodes,
		primaryEdges,
		secondaryEdges,
		relations,
		width,
		height,
	};
}

function buildPrimaryEdges(
	edges: { from: string; to: string }[],
	nodeMap: Map<string, CrawlGraphNode>,
	edgePoints: Map<string, { x: number; y: number }[]>,
	rankdir: "TB" | "LR",
): CrawlGraphEdge[] {
	const result: CrawlGraphEdge[] = [];
	for (const e of edges) {
		const source = nodeMap.get(e.from);
		const target = nodeMap.get(e.to);
		if (!source || !target) continue;

		const routed = edgePoints.get(`${e.from} -> ${e.to}`) ?? [];
		let x1: number;
		let y1: number;
		let x2: number;
		let y2: number;
		let points: { x: number; y: number }[] = [];

		if (routed.length >= 2) {
			points = routed;
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

		result.push({
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
	return result;
}

function buildSecondaryEdges(
	edges: { from: string; to: string; kind: CrawlRelationKind }[],
	nodeMap: Map<string, CrawlGraphNode>,
	rankdir: "TB" | "LR",
): CrawlGraphEdge[] {
	const result: CrawlGraphEdge[] = [];
	for (const e of edges) {
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

		result.push({
			from: e.from,
			to: e.to,
			kind: e.kind,
			x1,
			y1,
			x2,
			y2,
			points,
			path: buildCubicPath(x1, y1, x2, y2, rankdir),
		});
	}
	return result;
}
