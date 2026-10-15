import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listScrapeHistory: vi.fn(),
	deleteScrape: vi.fn(),
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

vi.mock("@/lib/services/scrape-service", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/services/scrape-service")>()),
	listScrapeHistory: mocks.listScrapeHistory,
	deleteScrape: mocks.deleteScrape,
}));

import { Route, validateScrapeHistoryRouteSearch } from "./scrap.history";

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
