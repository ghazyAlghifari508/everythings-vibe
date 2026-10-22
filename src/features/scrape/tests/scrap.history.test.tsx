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
