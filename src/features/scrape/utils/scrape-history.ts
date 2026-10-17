import { SCRAPE_HISTORY_DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type {
	ScrapeHistorySearch,
	ScrapeHistoryStatusGroup,
} from "@/features/scrape/types/scrape-contract";

export const SCRAPE_HISTORY_RETURN_FROM = "/design/scrap/history" as const;

export function resolveHistoryStatusGroup(
	status: string,
): ScrapeHistoryStatusGroup {
	if (status === "completed") return "completed";
	if (status === "failed") return "failed";
	return "processing";
}

export function historyTotalPages(total: number, pageSize: number): number {
	if (!Number.isSafeInteger(total) || total <= 0) return 0;
	if (!Number.isSafeInteger(pageSize) || pageSize <= 0) return 0;
	return Math.ceil(total / pageSize);
}

export function clampHistoryPage(page: unknown, totalPages: number): number {
	const safeTotal =
		Number.isSafeInteger(totalPages) && totalPages > 0 ? totalPages : 0;
	if (safeTotal <= 0) return 1;
	if (!Number.isSafeInteger(page)) return 1;
	const p = page as number;
	if (p < 1) return 1;
	if (p > safeTotal) return safeTotal;
	return p;
}

export function historyPageRange(
	page: number,
	pageSize: number,
	total: number,
): { start: number; end: number } {
	if (!Number.isSafeInteger(total) || total <= 0) return { start: 0, end: 0 };
	const safePage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
	const safeSize =
		Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 10;
	const start = (safePage - 1) * safeSize + 1;
	if (start > total) return { start: total, end: total };
	return { start, end: Math.min(safePage * safeSize, total) };
}

export function isHistoryFiltered(search: {
	mode?: string;
	status?: string;
	q?: string;
}): boolean {
	return Boolean(
		search.mode ?? search.status ?? (search.q && search.q.length > 0),
	);
}

export function buildHistoryDetailSearch(search: ScrapeHistorySearch): {
	from: typeof SCRAPE_HISTORY_RETURN_FROM;
	mode?: ScrapeHistorySearch["mode"];
	status?: ScrapeHistorySearch["status"];
	q?: string;
	sort?: ScrapeHistorySearch["sort"];
	page?: number;
	pageSize?: number;
} {
	return {
		from: SCRAPE_HISTORY_RETURN_FROM,
		...toScrapeHistorySearchParams(search),
	};
}

export function toScrapeHistorySearchParams(search: ScrapeHistorySearch): {
	mode?: ScrapeHistorySearch["mode"];
	status?: ScrapeHistorySearch["status"];
	q?: string;
	sort?: ScrapeHistorySearch["sort"];
	page?: number;
	pageSize?: number;
} {
	return {
		...(search.mode ? { mode: search.mode } : {}),
		...(search.status ? { status: search.status } : {}),
		...(search.q ? { q: search.q } : {}),
		...(search.sort !== "newest" ? { sort: search.sort } : {}),
		...(search.page !== 1 ? { page: search.page } : {}),
		...(search.pageSize !== SCRAPE_HISTORY_DEFAULT_PAGE_SIZE
			? { pageSize: search.pageSize }
			: {}),
	};
}

export function resolvePageAfterDelete(
	total: number,
	page: number,
	pageSize: number,
): number {
	const remaining = Number.isSafeInteger(total) ? Math.max(0, total - 1) : 0;
	const totalPages = historyTotalPages(remaining, pageSize);
	if (totalPages <= 0) return 1;
	const safePage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
	return Math.min(safePage, totalPages);
}
