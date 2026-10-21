import type { ScrapeMode } from "@/db/schema";
import { SCRAPE_HISTORY_DEFAULT_PAGE_SIZE } from "@/features/scrape/types/scrape-constants";
import type {
	ScrapeHistorySearch,
	ScrapeHistoryStatusGroup,
} from "@/features/scrape/types/scrape-contract";
import { APP_TIME_ZONE } from "@/lib/constants";

export const SCRAPE_HISTORY_RETURN_FROM = "/scrape/history" as const;

// The row date is a compact column, so the month is abbreviated. The instant is
// still rendered in the product timezone so two users never disagree about
// which day a scrape ran on.
export function formatHistoryDate(value: string | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(date.getTime())) return "—";
	return date.toLocaleDateString("id-ID", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: APP_TIME_ZONE,
	});
}

export function resolveHistoryStatusGroup(
	status: string,
): ScrapeHistoryStatusGroup {
	if (status === "completed") return "completed";
	if (status === "failed") return "failed";
	return "processing";
}

// One vocabulary for the row status: the group decides the label, so a status
// the product adds later is never described with a second wording. An unknown
// status is reported as still running, because claiming a finished job would
// be worse than showing an unfinished one.
export const SCRAPE_HISTORY_STATUS_GROUP_LABELS = {
	completed: "Selesai",
	processing: "Diproses",
	failed: "Gagal",
} as const satisfies Record<ScrapeHistoryStatusGroup, string>;

export function historyStatusLabel(status: string): string {
	return SCRAPE_HISTORY_STATUS_GROUP_LABELS[resolveHistoryStatusGroup(status)];
}

// The extraction mode is named once so the filter rail and the result row can
// never drift apart.
export function modeLabel(mode?: ScrapeMode): string {
	if (mode === "crawl") return "Crawl";
	if (mode === "images") return "Images";
	return mode === "html" ? "HTML" : "DESIGN.md";
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

// The filter that decides which rows a "select all matching" scope covers.
// Sorting is deliberately absent because it reorders the same rows instead of
// changing which rows match.
export function historyFilterKey(search: {
	mode?: string;
	status?: string;
	q?: string;
}): string {
	return `${search.mode ?? ""}|${search.status ?? ""}|${search.q ?? ""}`;
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

// A bulk delete can empty several pages at once, so the landing page is
// resolved against the number of rows that actually disappeared rather than
// against a single removed row.
export function resolvePageAfterBulkDelete(
	total: number,
	deleted: number,
	page: number,
	pageSize: number,
): number {
	const safeTotal = Number.isSafeInteger(total) ? Math.max(0, total) : 0;
	const safeDeleted = Number.isSafeInteger(deleted) ? Math.max(0, deleted) : 0;
	const totalPages = historyTotalPages(safeTotal - safeDeleted, pageSize);
	if (totalPages <= 0) return 1;
	const safePage = Number.isSafeInteger(page) && page >= 1 ? page : 1;
	return Math.min(safePage, totalPages);
}
