import type { scrapePages } from "@/db/schema";
import { shortCrawlLabel } from "./crawl-relations";

type Page = typeof scrapePages.$inferSelect;

/**
 * A link target observed from more than one page, grouped so the blueprint
 * stops repeating the same navigation on every page section.
 */
export interface SharedNavigationTarget {
	url: string;
	label: string;
	/** URLs of the pages whose HTML linked to this target. */
	sources: string[];
}

/** An observed link between two crawled pages. */
export interface BlueprintLinkEdge {
	from: string;
	to: string;
}

export interface BlueprintNavigation {
	/**
	 * Targets linked from every page that carries link evidence. The set is
	 * only populated when at least two such pages exist, because a single
	 * source cannot establish repetition.
	 */
	shared: SharedNavigationTarget[];
	/** Edges whose target is not part of the shared set. */
	pageSpecific: BlueprintLinkEdge[];
	/** Pages that contributed at least one outgoing link. */
	linkSources: string[];
}

function completedWithContent(pages: Page[]): Page[] {
	return pages.filter(
		(row) => row.status === "completed" && row.content !== null,
	);
}

/**
 * Groups repeated links as shared navigation.
 *
 * The only evidence available is link repetition across pages, so a target is
 * grouped only when every other page that carries link evidence links to it.
 * A page never links to itself in the count, so the target's own row is
 * excluded from the eligible set. The element that rendered the link (navbar,
 * footer, sidebar) is not recorded in the crawl data, so the result is
 * labelled as repeated links rather than a verified navigation component.
 */
export function deriveSharedNavigation(pages: Page[]): BlueprintNavigation {
	const rows = completedWithContent(pages);
	const linkSources = rows.filter(
		(row) => (row.content?.outgoingPages ?? []).length > 0,
	);
	const sourcesByTarget = new Map<string, string[]>();

	for (const row of linkSources) {
		for (const target of row.content?.outgoingPages ?? []) {
			if (target === row.url) continue;
			const sources = sourcesByTarget.get(target);
			if (sources) sources.push(row.url);
			else sourcesByTarget.set(target, [row.url]);
		}
	}

	const shared: SharedNavigationTarget[] = [];
	if (linkSources.length >= 2) {
		for (const [url, sources] of sourcesByTarget) {
			const eligible = linkSources.filter((row) => row.url !== url).length;
			if (sources.length < 2 || sources.length !== eligible) continue;
			const target = rows.find((row) => row.url === url);
			shared.push({
				url,
				label: shortCrawlLabel(target?.title ?? null, url),
				sources: [...sources].sort(),
			});
		}
	}
	shared.sort((a, b) => a.url.localeCompare(b.url));

	const sharedUrls = new Set(shared.map((target) => target.url));
	const pageSpecific: BlueprintLinkEdge[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		for (const target of row.content?.outgoingPages ?? []) {
			if (target === row.url) continue;
			if (sharedUrls.has(target)) continue;
			const key = `${row.url} -> ${target}`;
			if (seen.has(key)) continue;
			seen.add(key);
			pageSpecific.push({ from: row.url, to: target });
		}
	}
	pageSpecific.sort(
		(a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
	);

	return {
		shared,
		pageSpecific,
		linkSources: linkSources.map((row) => row.url).sort(),
	};
}
