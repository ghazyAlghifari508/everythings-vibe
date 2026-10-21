import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listScrapeHistory: vi.fn(),
	deleteScrape: vi.fn(),
	deleteOwnedScrapes: vi.fn(),
	prepareScrapeHistoryBulkSelection: vi.fn(),
	requireUserServer: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({ handler: (handler: unknown) => handler }),
		handler: (handler: unknown) => handler,
	}),
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: mocks.requireUserServer,
}));

vi.mock(
	"@/features/scrape/services/scrape-service",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@/features/scrape/services/scrape-service")
		>()),
		listScrapeHistory: mocks.listScrapeHistory,
		deleteScrape: mocks.deleteScrape,
		deleteOwnedScrapes: mocks.deleteOwnedScrapes,
		prepareScrapeHistoryBulkSelection: mocks.prepareScrapeHistoryBulkSelection,
	}),
);

import {
	deleteScrapeItems,
	loadScrapesHistory,
	prepareScrapeHistorySelection,
} from "@/features/scrape/services/scrape-history-loader.functions";
import {
	Route,
	validateScrapeHistoryRouteSearch,
} from "@/routes/scrape/history";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUserServer.mockResolvedValue({ id: "owner-1" });
});

describe("scrap history route search", () => {
	it("validates a combined filter into sharable state", () => {
		expect(
			validateScrapeHistoryRouteSearch({
				mode: "html",
				status: "failed",
				q: "stitch",
				sort: "oldest",
				page: "2",
				pageSize: "20",
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

	it("keeps the default view URL clean", () => {
		expect(validateScrapeHistoryRouteSearch({})).toEqual({});
	});

	it("falls back to the first page for invalid parameters", () => {
		expect(
			validateScrapeHistoryRouteSearch({
				mode: "unknown",
				page: "oops",
				pageSize: 999,
			}),
		).toEqual({});
	});

	it("wires the route validator to the shared search contract", () => {
		expect(Route.options.validateSearch).toBeDefined();
		expect(Route.options.loaderDeps).toBeDefined();
	});
});

describe("scrape history loader", () => {
	function summary(id: string) {
		return {
			id,
			sourceUrl: "https://example.test/",
			domain: "example.test",
			title: null,
			mode: "design" as const,
			status: "completed",
			createdAt: new Date("2026-10-14T00:00:00.000Z"),
		};
	}

	it("reads the filtered page with a server side offset", async () => {
		mocks.listScrapeHistory.mockResolvedValue({
			items: [summary("a")],
			total: 33,
			limit: 10,
			offset: 10,
		});

		const result = await loadScrapesHistory({
			data: {
				mode: "html",
				status: "failed",
				q: "stitch",
				sort: "oldest",
				page: 2,
				pageSize: 10,
			},
		});

		expect(mocks.listScrapeHistory).toHaveBeenCalledTimes(1);
		expect(mocks.listScrapeHistory).toHaveBeenCalledWith("owner-1", {
			mode: "html",
			status: "failed",
			search: "stitch",
			sort: "oldest",
			limit: 10,
			offset: 10,
		});
		expect(result.total).toBe(33);
		expect(result.page).toBe(2);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.createdAt).toBe("2026-10-14T00:00:00.000Z");
	});

	it("clamps a page beyond the last one and reads the settled page instead", async () => {
		mocks.listScrapeHistory
			.mockResolvedValueOnce({ items: [], total: 5, limit: 10, offset: 90 })
			.mockResolvedValueOnce({
				items: [summary("a")],
				total: 5,
				limit: 10,
				offset: 0,
			});

		const result = await loadScrapesHistory({
			data: { page: 10, pageSize: 10 },
		});

		expect(mocks.listScrapeHistory).toHaveBeenCalledTimes(2);
		expect(mocks.listScrapeHistory).toHaveBeenNthCalledWith(
			1,
			"owner-1",
			expect.objectContaining({ offset: 90 }),
		);
		expect(mocks.listScrapeHistory).toHaveBeenNthCalledWith(
			2,
			"owner-1",
			expect.objectContaining({ offset: 0, limit: 10 }),
		);
		expect(result.page).toBe(1);
		expect(result.total).toBe(5);
		expect(result.items).toHaveLength(1);
	});
});

describe("scrape history bulk server functions", () => {
	it("deletes only the rows owned by the signed-in user", async () => {
		mocks.deleteOwnedScrapes.mockResolvedValue({
			deleted: 2,
			skipped: 0,
			deletedIds: ["a", "b"],
		});

		const result = await deleteScrapeItems({
			data: { ids: ["a", "b"] },
		});

		expect(mocks.deleteOwnedScrapes).toHaveBeenCalledWith(
			["a", "b"],
			"owner-1",
		);
		expect(result).toEqual({
			deleted: 2,
			skipped: 0,
			deletedIds: ["a", "b"],
		});
	});

	it("prepares the selection scope from the signed-in user's own rows", async () => {
		mocks.prepareScrapeHistoryBulkSelection.mockResolvedValue({
			ids: ["a"],
			total: 1,
			truncated: false,
		});

		const result = await prepareScrapeHistorySelection({
			data: { mode: "html", status: "failed", q: "stitch", sort: "oldest" },
		});

		expect(mocks.prepareScrapeHistoryBulkSelection).toHaveBeenCalledWith(
			"owner-1",
			{
				mode: "html",
				status: "failed",
				search: "stitch",
				sort: "oldest",
			},
		);
		expect(result).toEqual({ ids: ["a"], total: 1, truncated: false });
	});
});
