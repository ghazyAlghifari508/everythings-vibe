// @vitest-environment jsdom

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	RouterProvider,
} from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScrapeBackLink } from "../components/scrape-back-link";
import {
	parseScrapeHistorySearch,
	parseScrapeWorkspaceSearch,
} from "../types/scrape-contract";
import {
	buildHistoryDetailSearch,
	toScrapeHistorySearchParams,
} from "../utils/scrape-history";
import { parseScrapeReturnSearch } from "../utils/scrape-return-path";

afterEach(cleanup);

async function setup(url: string) {
	const root = createRootRoute();
	const workspace = createRoute({
		getParentRoute: () => root,
		path: "/scrape",
		validateSearch: parseScrapeWorkspaceSearch,
		component: () => <h1>Workspace</h1>,
	});
	const historyRoute = createRoute({
		getParentRoute: () => root,
		path: "/scrape/history",
		validateSearch: parseScrapeHistorySearch,
		component: () => (
			<Link
				to="/scrape/$id"
				params={{ id: "sample-id" }}
				search={buildHistoryDetailSearch(historyRoute.useSearch())}
			>
				Buka hasil
			</Link>
		),
	});
	const detail = createRoute({
		getParentRoute: () => root,
		path: "/scrape/$id",
		validateSearch: (search) => ({
			...parseScrapeReturnSearch(search),
			...toScrapeHistorySearchParams(parseScrapeHistorySearch(search)),
		}),
		component: () => {
			const search = detail.useSearch();
			return (
				<ScrapeBackLink
					from={search.from}
					historySearch={parseScrapeHistorySearch(search)}
				/>
			);
		},
	});
	const history = createMemoryHistory({ initialEntries: [url] });
	const router = createRouter({
		routeTree: root.addChildren([workspace, historyRoute, detail]),
		history,
	});
	await router.load();
	render(<RouterProvider router={router} />);
	return router;
}

describe("scrape navigation round trips", () => {
	it("restores every filtered history field and retains back/forward entries", async () => {
		const query = {
			mode: "images",
			status: "failed",
			q: "sample",
			sort: "oldest",
			page: 3,
			pageSize: 50,
		};
		const router = await setup(
			"/scrape/history?mode=images&status=failed&q=sample&sort=oldest&page=3&pageSize=50",
		);
		fireEvent.click(await screen.findByRole("link", { name: "Buka hasil" }));
		await screen.findByRole("link", { name: "Kembali" });
		expect(router.state.location.pathname).toBe("/scrape/sample-id");
		expect(router.state.location.search).toEqual({
			from: "/scrape/history",
			...query,
		});
		router.history.back();
		await screen.findByRole("link", { name: "Buka hasil" });
		expect(router.state.location.search).toEqual(query);
		router.history.forward();
		fireEvent.click(await screen.findByRole("link", { name: "Kembali" }));
		await screen.findByRole("link", { name: "Buka hasil" });
		expect(router.state.location.pathname).toBe("/scrape/history");
		expect(router.state.location.search).toEqual(query);
	});

	it.each([
		"/scrape",
		"/design/scrap",
	])("restores only workspace mode from %s, never history filters", async (from) => {
		const router = await setup(
			`/scrape/sample-id?from=${encodeURIComponent(from)}&mode=html&status=failed&q=sample&page=3&pageSize=50&sort=oldest`,
		);
		fireEvent.click(await screen.findByRole("link", { name: "Kembali" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/scrape"));
		expect(router.state.location.search).toEqual({ mode: "html" });
	});

	it("normalizes a legacy history origin before restoring its filters", async () => {
		const router = await setup(
			"/scrape/sample-id?from=%2Fdesign%2Fscrap%2Fhistory&mode=crawl&page=2&pageSize=20&sort=oldest",
		);
		fireEvent.click(await screen.findByRole("link", { name: "Kembali" }));
		await screen.findByRole("link", { name: "Buka hasil" });
		expect(router.state.location.pathname).toBe("/scrape/history");
		expect(router.state.location.search).toEqual({
			mode: "crawl",
			q: "",
			page: 2,
			pageSize: 20,
			sort: "oldest",
		});
	});
});
