import { describe, expect, it } from "vitest";
import {
	parseScrapeHistorySearch,
	resolveScrapeHistoryOffset,
} from "@/features/scrape/types/scrape-contract";

describe("parseScrapeHistorySearch", () => {
	it("returns defaults for an empty search", () => {
		expect(parseScrapeHistorySearch({})).toEqual({
			q: "",
			sort: "newest",
			page: 1,
			pageSize: 10,
		});
	});

	it("accepts a combined mode, status, search, sort, and pagination filter", () => {
		expect(
			parseScrapeHistorySearch({
				mode: "html",
				status: "failed",
				q: "stitch",
				sort: "oldest",
				page: 2,
				pageSize: 20,
			}),
		).toEqual({
			mode: "html",
			status: "failed",
			q: "stitch",
			sort: "oldest",
			page: 2,
			pageSize: 20,
		});
	});

	it("coerces numeric strings from URL search parameters", () => {
		const parsed = parseScrapeHistorySearch({ page: "3", pageSize: "50" });
		expect(parsed.page).toBe(3);
		expect(parsed.pageSize).toBe(50);
	});

	it("falls back to defaults for invalid mode, status, sort, and pagination", () => {
		expect(
			parseScrapeHistorySearch({
				mode: "unknown",
				status: "unknown",
				sort: "random",
				page: -2,
				pageSize: 999,
			}),
		).toEqual({ q: "", sort: "newest", page: 1, pageSize: 10 });
	});

	it("trims search and bounds it to a literal substring", () => {
		expect(parseScrapeHistorySearch({ q: "  example  " }).q).toBe("example");
		expect(parseScrapeHistorySearch({ q: "x".repeat(500) }).q).toHaveLength(
			128,
		);
	});

	it("resolves limit and offset for the current page", () => {
		expect(
			resolveScrapeHistoryOffset(
				parseScrapeHistorySearch({ page: 3, pageSize: 10 }),
			),
		).toEqual({ limit: 10, offset: 20 });
	});
});
