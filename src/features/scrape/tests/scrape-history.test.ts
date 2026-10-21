import { describe, expect, it } from "vitest";
import {
	buildHistoryDetailSearch,
	clampHistoryPage,
	historyPageRange,
	historyTotalPages,
	isHistoryFiltered,
	resolveHistoryStatusGroup,
	resolvePageAfterBulkDelete,
	resolvePageAfterDelete,
	toScrapeHistorySearchParams,
} from "@/features/scrape/utils/scrape-history";

describe("resolveHistoryStatusGroup", () => {
	it("maps terminal database states to their own groups", () => {
		expect(resolveHistoryStatusGroup("completed")).toBe("completed");
		expect(resolveHistoryStatusGroup("failed")).toBe("failed");
	});

	it("maps every active capture state to processing", () => {
		for (const status of [
			"queued",
			"capturing",
			"extracting",
			"generating",
			"saving",
		]) {
			expect(resolveHistoryStatusGroup(status)).toBe("processing");
		}
	});

	it("treats unknown states as processing instead of success", () => {
		expect(resolveHistoryStatusGroup("unexpected")).toBe("processing");
	});
});

describe("historyTotalPages", () => {
	it("computes pages from the filtered total", () => {
		expect(historyTotalPages(33, 10)).toBe(4);
		expect(historyTotalPages(20, 20)).toBe(1);
	});

	it("returns zero pages when nothing matches", () => {
		expect(historyTotalPages(0, 10)).toBe(0);
	});
});

describe("clampHistoryPage", () => {
	it("clamps out-of-range pages to the available range", () => {
		expect(clampHistoryPage(99, 4)).toBe(4);
		expect(clampHistoryPage(0, 4)).toBe(1);
		expect(clampHistoryPage(Number.NaN, 4)).toBe(1);
	});

	it("stays on the first page when there are no pages", () => {
		expect(clampHistoryPage(5, 0)).toBe(1);
	});
});

describe("historyPageRange", () => {
	it("reports the visible 1-based range", () => {
		expect(historyPageRange(2, 10, 33)).toEqual({ start: 11, end: 20 });
		expect(historyPageRange(4, 10, 33)).toEqual({ start: 31, end: 33 });
	});

	it("reports an empty range when nothing matches", () => {
		expect(historyPageRange(1, 10, 0)).toEqual({ start: 0, end: 0 });
	});
});

describe("isHistoryFiltered", () => {
	it("detects an active search or filter", () => {
		expect(isHistoryFiltered({ q: "example" })).toBe(true);
		expect(isHistoryFiltered({ mode: "html" })).toBe(true);
		expect(isHistoryFiltered({ status: "failed" })).toBe(true);
	});

	it("reports an unfiltered view as unfiltered", () => {
		expect(isHistoryFiltered({ q: "" })).toBe(false);
		expect(isHistoryFiltered({})).toBe(false);
	});
});

describe("buildHistoryDetailSearch", () => {
	it("carries the filter state for the return trip", () => {
		expect(
			buildHistoryDetailSearch({
				mode: "html",
				status: "failed",
				q: "stitch",
				sort: "oldest",
				page: 2,
				pageSize: 20,
			}),
		).toEqual({
			from: "/scrape/history",
			mode: "html",
			status: "failed",
			q: "stitch",
			sort: "oldest",
			page: 2,
			pageSize: 20,
		});
	});

	it("omits empty filters so the shared URL stays clean", () => {
		const built = buildHistoryDetailSearch({
			q: "",
			sort: "newest",
			page: 1,
			pageSize: 10,
		});
		expect(built).toEqual({ from: "/scrape/history" });
	});
});

describe("toScrapeHistorySearchParams", () => {
	it("shares the filter state without the return marker", () => {
		expect(
			toScrapeHistorySearchParams({
				mode: "crawl",
				q: "",
				sort: "oldest",
				page: 2,
				pageSize: 20,
			}),
		).toEqual({ mode: "crawl", sort: "oldest", page: 2, pageSize: 20 });
	});

	it("drops default values so the default view has a clean URL", () => {
		expect(
			toScrapeHistorySearchParams({
				q: "",
				sort: "newest",
				page: 1,
				pageSize: 10,
			}),
		).toEqual({});
	});
});

describe("resolvePageAfterDelete", () => {
	it("stays on the page when rows remain", () => {
		expect(resolvePageAfterDelete(33, 2, 10)).toBe(2);
	});

	it("steps back when the last row of the last page was deleted", () => {
		expect(resolvePageAfterDelete(31, 4, 10)).toBe(3);
	});

	it("returns to the first page when nothing remains", () => {
		expect(resolvePageAfterDelete(1, 1, 10)).toBe(1);
	});
});

describe("resolvePageAfterBulkDelete", () => {
	it("stays on the page when the batch left other pages intact", () => {
		expect(resolvePageAfterBulkDelete(33, 3, 2, 10)).toBe(2);
	});

	it("steps back when the batch emptied the last page", () => {
		expect(resolvePageAfterBulkDelete(31, 11, 4, 10)).toBe(2);
	});

	it("returns to the first page when the whole result set was deleted", () => {
		expect(resolvePageAfterBulkDelete(20, 20, 2, 10)).toBe(1);
	});

	it("ignores a deleted count larger than the total", () => {
		expect(resolvePageAfterBulkDelete(5, 99, 3, 10)).toBe(1);
	});
});
