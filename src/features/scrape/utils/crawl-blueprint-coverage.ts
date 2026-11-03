import type { scrapePages } from "@/db/schema";
import type { BlueprintScope } from "./crawl-blueprint";

type Page = typeof scrapePages.$inferSelect;

export interface BlueprintCoverage {
	discovered: number;
	completed: number;
	skipped: number;
	failed: number;
	queued: number;
	/** Shallowest and deepest depth actually observed, null when nothing ran. */
	minDepth: number | null;
	maxDepth: number | null;
	/** True when the page cap stopped the crawl. */
	pageLimitReached: boolean;
	/** True when a page was observed at the configured depth ceiling. */
	depthLimitReached: boolean;
	/**
	 * True when the page cap stopped the crawl before the depth ceiling was
	 * reached, which is the normal outcome for a wide site under a small cap.
	 */
	stoppedByPageLimit: boolean;
}

/**
 * Derives coverage facts from the crawl result alone.
 *
 * Every field is a count or a comparison against the configured scope, so the
 * exported document can state what was observed without claiming the whole site
 * was analysed.
 */
export function deriveCoverage(
	pages: Page[],
	scope?: BlueprintScope,
): BlueprintCoverage {
	const depths = pages.map((row) => row.depth);
	const maxDepth = depths.length > 0 ? Math.max(...depths) : null;
	const minDepth = depths.length > 0 ? Math.min(...depths) : null;
	const pageLimitReached = scope ? pages.length >= scope.maxPages : false;
	const depthLimitReached = scope
		? maxDepth !== null && maxDepth >= scope.maxDepth
		: false;

	return {
		discovered: pages.length,
		completed: pages.filter((row) => row.status === "completed").length,
		skipped: pages.filter((row) => row.status === "skipped").length,
		failed: pages.filter((row) => row.status === "failed").length,
		queued: pages.filter((row) => row.status === "queued").length,
		minDepth,
		maxDepth,
		pageLimitReached,
		depthLimitReached,
		stoppedByPageLimit: Boolean(
			scope && pageLimitReached && !depthLimitReached,
		),
	};
}
