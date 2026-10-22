import type { scrapePages } from "@/db/schema";

type Page = typeof scrapePages.$inferSelect;

/**
 * Relationship between two crawled pages.
 *
 * `primary` is the crawler's own discovery parent: the page whose link made
 * the crawler queue this URL. `secondary` and `cross` are links observed in
 * the page HTML, so they are facts about the document, not about crawl order.
 * A `cross` link joins two pages found at the same depth.
 */
export type CrawlRelationKind = "primary" | "secondary" | "cross";

export interface CrawlRelationEdge {
	from: string;
	to: string;
	kind: CrawlRelationKind;
}

/** A page referenced by a relationship, with the label used in the UI. */
export interface CrawlRelatedPage {
	url: string;
	label: string;
	title: string | null;
	kind: CrawlRelationKind;
}

export interface CrawlPageRelations {
	url: string;
	label: string;
	/** The page whose link made the crawler discover this page. */
	foundFrom: CrawlRelatedPage | null;
	/** Pages this page links to. */
	outgoing: CrawlRelatedPage[];
	/** Pages that link to this page. */
	incoming: CrawlRelatedPage[];
	/** Outgoing links that are not part of the discovery tree. */
	additionalOutgoing: CrawlRelatedPage[];
	/** Incoming links that are not part of the discovery tree. */
	additionalIncoming: CrawlRelatedPage[];
	outgoingCount: number;
	incomingCount: number;
	/** Number of relationships that the default sitemap does not draw. */
	additionalCount: number;
}

export interface CrawlRelations {
	primaryEdges: CrawlRelationEdge[];
	secondaryEdges: CrawlRelationEdge[];
	byUrl: Map<string, CrawlPageRelations>;
}

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

function relationKey(from: string, to: string): string {
	return `${from} -> ${to}`;
}

function relatedPage(row: Page, kind: CrawlRelationKind): CrawlRelatedPage {
	return {
		url: row.url,
		label: shortCrawlLabel(row.title, row.url),
		title: row.title,
		kind,
	};
}

/**
 * Derives every relationship the crawl actually observed.
 *
 * Nothing here is inferred from the URL shape: a primary edge exists only
 * when the crawler recorded a discovery parent, and a secondary edge exists
 * only when the page HTML linked to another captured page. Links to pages
 * outside the crawl result and self-links are dropped, and every edge is
 * unique per direction so the graph never draws the same line twice.
 */
export function buildCrawlRelations(pages: Page[]): CrawlRelations {
	const rowsByUrl = new Map<string, Page>();
	for (const row of pages) rowsByUrl.set(row.url, row);

	const primaryEdges: CrawlRelationEdge[] = [];
	const primaryKeys = new Set<string>();

	for (const row of pages) {
		const parentUrl = row.parentUrl;
		if (!parentUrl) continue;
		// A parent outside the crawl result cannot be drawn as a real edge.
		if (!rowsByUrl.has(parentUrl)) continue;
		if (parentUrl === row.url) continue;
		const key = relationKey(parentUrl, row.url);
		if (primaryKeys.has(key)) continue;
		primaryKeys.add(key);
		primaryEdges.push({ from: parentUrl, to: row.url, kind: "primary" });
	}

	const secondaryEdges: CrawlRelationEdge[] = [];
	const secondaryKeys = new Set<string>();

	for (const row of pages) {
		for (const target of row.content?.outgoingPages ?? []) {
			// A link to a page outside the crawl result is not a graph edge.
			if (!rowsByUrl.has(target)) continue;
			if (target === row.url) continue;
			const key = relationKey(row.url, target);
			if (primaryKeys.has(key) || secondaryKeys.has(key)) continue;
			secondaryKeys.add(key);
			const targetRow = rowsByUrl.get(target);
			const isCross = targetRow ? targetRow.depth === row.depth : false;
			secondaryEdges.push({
				from: row.url,
				to: target,
				kind: isCross ? "cross" : "secondary",
			});
		}
	}

	const outgoingByUrl = new Map<string, CrawlRelatedPage[]>();
	const incomingByUrl = new Map<string, CrawlRelatedPage[]>();
	const foundFromByUrl = new Map<string, CrawlRelatedPage>();

	for (const row of pages) {
		outgoingByUrl.set(row.url, []);
		incomingByUrl.set(row.url, []);
	}

	for (const edge of primaryEdges) {
		const from = rowsByUrl.get(edge.from);
		const to = rowsByUrl.get(edge.to);
		if (!from || !to) continue;
		outgoingByUrl.get(edge.from)?.push(relatedPage(to, "primary"));
		incomingByUrl.get(edge.to)?.push(relatedPage(from, "primary"));
		foundFromByUrl.set(edge.to, relatedPage(from, "primary"));
	}

	for (const edge of secondaryEdges) {
		const from = rowsByUrl.get(edge.from);
		const to = rowsByUrl.get(edge.to);
		if (!from || !to) continue;
		outgoingByUrl.get(edge.from)?.push(relatedPage(to, edge.kind));
		incomingByUrl.get(edge.to)?.push(relatedPage(from, edge.kind));
	}

	const byUrl = new Map<string, CrawlPageRelations>();
	for (const row of pages) {
		const outgoing = outgoingByUrl.get(row.url) ?? [];
		const incoming = incomingByUrl.get(row.url) ?? [];
		const additionalOutgoing = outgoing.filter(
			(item) => item.kind !== "primary",
		);
		const additionalIncoming = incoming.filter(
			(item) => item.kind !== "primary",
		);
		byUrl.set(row.url, {
			url: row.url,
			label: shortCrawlLabel(row.title, row.url),
			foundFrom: foundFromByUrl.get(row.url) ?? null,
			outgoing,
			incoming,
			additionalOutgoing,
			additionalIncoming,
			outgoingCount: outgoing.length,
			incomingCount: incoming.length,
			additionalCount: additionalOutgoing.length + additionalIncoming.length,
		});
	}

	return { primaryEdges, secondaryEdges, byUrl };
}
