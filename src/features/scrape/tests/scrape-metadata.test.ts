import { describe, expect, it, vi } from "vitest";
import { Route as detail } from "@/routes/scrape/$id";
import { Route as history } from "@/routes/scrape/history";
import { Route as workspace } from "@/routes/scrape/index";

vi.mock("@/features/scrape/components/scrape-detail-view", () => ({
	ScrapeDetailView: () => null,
	ScrapeDetailErrorView: () => null,
}));
vi.mock("@/features/scrape/components/scrape-history-view", () => ({
	ScrapeHistoryView: () => null,
	ScrapeHistoryPendingView: () => null,
	ScrapeHistoryErrorView: () => null,
}));
vi.mock("@/features/scrape/components/scrape-workspace-view", () => ({
	ScrapeWorkspaceView: () => null,
}));
vi.mock("@/features/scrape/services/scrape-detail-loader.functions", () => ({
	loadScrapeDetail: vi.fn(),
}));
vi.mock("@/features/scrape/services/scrape-history-loader.functions", () => ({
	loadScrapesHistory: vi.fn(),
	deleteScrapeItem: vi.fn(),
}));

describe("canonical VibeScrape metadata identity", () => {
	it.each([
		{ route: workspace, title: "Scrape website | VibeScrape" },
		{ route: history, title: "Riwayat | VibeScrape" },
		{ route: detail, title: "Hasil ekstraksi | VibeScrape" },
	])("uses the standalone product title $title", ({ route, title }) => {
		const head: unknown = route.options.head;
		if (typeof head !== "function")
			throw new Error("Route must define metadata");
		const metadata: unknown = Reflect.apply(head, undefined, [{}]);
		expect(metadata).toEqual({
			meta: expect.arrayContaining([
				{ title },
				{ name: "description", content: expect.any(String) },
			]),
		});
	});
});
