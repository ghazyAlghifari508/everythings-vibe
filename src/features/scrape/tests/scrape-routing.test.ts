import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	isRedirect,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loaders = vi.hoisted(() => ({
	detail: vi.fn(),
	history: vi.fn(),
}));

vi.mock("@/features/scrape/services/scrape-detail-loader.functions", () => ({
	loadScrapeDetail: loaders.detail,
}));
vi.mock("@/features/scrape/services/scrape-history-loader.functions", () => ({
	loadScrapesHistory: loaders.history,
	deleteScrapeItem: vi.fn(),
}));

const root = createRootRoute();
const routesDirectory = resolve("src/routes");
const realRoutes = new Set([
	"scrape.tsx",
	"scrape/index.tsx",
	"scrape/$id.tsx",
	"scrape/history.tsx",
	"design/scrap.tsx",
	"design/scrap.index.tsx",
	"design/scrap.$id.tsx",
	"design/scrap.history.tsx",
]);

// Keep generated topology and scrape lifecycles real without loading unrelated surfaces.
for (const file of readdirSync(routesDirectory, { recursive: true })) {
	const relative = String(file).replaceAll("\\", "/");
	if (!/\.tsx?$/.test(relative) || realRoutes.has(relative)) continue;
	vi.doMock(resolve(routesDirectory, relative), () => ({
		Route:
			relative === "__root.tsx"
				? root
				: createRoute({ id: relative, getParentRoute: () => root }),
	}));
}

const { routeTree } = await import("@/routeTree.gen");
const { Route: legacyIndex } = await import("@/routes/design/scrap.index");
const { Route: legacyDetail } = await import("@/routes/design/scrap.$id");
const { Route: legacyHistory } = await import("@/routes/design/scrap.history");

async function load(url: string) {
	const history = createMemoryHistory({ initialEntries: [url] });
	const router = createRouter({
		routeTree,
		history,
		isServer: true,
		context: { queryClient: new QueryClient() },
	});
	await router.load();
	return {
		state: {
			matches: router.state.matches,
			redirect:
				router._serverResult?.type === "redirect"
					? router._serverResult.redirect
					: undefined,
		},
	};
}

async function normalizedLoad(url: string) {
	const seen = new Set<string>();
	for (let hop = 0; hop < 5; hop++) {
		if (seen.has(url)) throw new Error(`Redirect loop: ${url}`);
		seen.add(url);
		const result = await load(url);
		const href = result.state.redirect?.options.href;
		if (
			!href ||
			new URL(href, "https://app.invalid").pathname.replace(/\/$/, "") !==
				new URL(url, "https://app.invalid").pathname.replace(/\/$/, "")
		)
			return result;
		url = href;
	}
	throw new Error("URL normalization did not terminate");
}

beforeEach(() => {
	vi.clearAllMocks();
	loaders.detail.mockResolvedValue({ id: "sample-id" });
	loaders.history.mockResolvedValue({ items: [], total: 0 });
});

describe("canonical scrape routes in generated topology", () => {
	it.each([
		["/scrape", "/scrape/"],
		["/scrape/", "/scrape/"],
		["/scrape/sample-id", "/scrape/$id"],
		["/scrape/history", "/scrape/history"],
	])("resolves %s without redirecting", async (url, routeId) => {
		const router = await normalizedLoad(url);
		expect(router.state.matches.at(-1)?.routeId).toBe(routeId);
		expect(router.state.matches.at(-1)?.status).toBe("success");
		expect(router.state.redirect).toBeUndefined();
	});

	it("loads history with normalized filters, sorting and pagination", async () => {
		await normalizedLoad(
			"/scrape/history?mode=html&status=failed&q=%20sample%20&sort=oldest&page=2&pageSize=20",
		);
		expect(loaders.history).toHaveBeenCalledWith({
			data: {
				mode: "html",
				status: "failed",
				q: "sample",
				sort: "oldest",
				page: 2,
				pageSize: 20,
			},
		});
	});

	it.each([
		"/scrape/history",
		"/scrape/sample-id",
	])("keeps auth redirects on %s", async (path) => {
		loaders.detail.mockRejectedValue(new Error("Unauthorized"));
		loaders.history.mockRejectedValue(new Error("Unauthorized"));
		const router = await normalizedLoad(path);
		expect(router.state.redirect?.status).toBe(307);
		expect(router.state.redirect?.options.href).toBe("/login");
	});

	it("keeps loader failures as errors, not successful redirects", async () => {
		const error = new Error("NOT_FOUND");
		loaders.detail.mockRejectedValue(error);
		const router = await normalizedLoad("/scrape/missing");
		expect(router.state.matches.at(-1)?.status).toBe("error");
		expect(router.state.matches.at(-1)?.error).toBe(error);
		expect(router.state.redirect).toBeUndefined();
	});
});

describe("legacy scrape bookmarks", () => {
	it.each([
		["/design/scrap", "/scrape"],
		["/design/scrap/", "/scrape"],
		["/design/scrap/sample-id", "/scrape/sample-id"],
		["/design/scrap/history", "/scrape/history"],
	])("redirects %s to %s on SSR and terminates on canonical reload", async (legacy, canonical) => {
		const router = await normalizedLoad(legacy);
		const redirect = router.state.redirect;
		expect(isRedirect(redirect)).toBe(true);
		expect(redirect?.status).toBe(307);
		expect(redirect?.options.replace).toBe(true);
		expect(
			new URL(redirect?.options.href ?? "", "https://app.invalid").pathname,
		).toBe(canonical);
		expect(loaders.detail).not.toHaveBeenCalled();
		expect(loaders.history).not.toHaveBeenCalled();
		const destination = await normalizedLoad(redirect?.options.href ?? "");
		expect(destination.state.redirect).toBeUndefined();
		expect(destination.state.matches.at(-1)?.status).toBe("success");
	});

	it.each([
		"design",
		"html",
		"crawl",
		"images",
	])("preserves workspace mode %s", async (mode) => {
		const router = await normalizedLoad(`/design/scrap?mode=${mode}`);
		const destination = await normalizedLoad(
			router.state.redirect?.options.href ?? "",
		);
		expect(destination.state.matches.at(-1)?.search).toEqual({ mode });
	});

	it.each([
		"/design/scrap/history",
		"/design/scrap/sample-id",
	])("preserves filtered bookmark %s and safe return context", async (path) => {
		const router = await normalizedLoad(
			`${path}?from=/design/scrap/history&mode=images&status=processing&q=sample&sort=oldest&page=3&pageSize=50#results`,
		);
		const redirect = router.state.redirect;
		expect(redirect?.options.hash).toBe("results");
		const destination = await normalizedLoad(redirect?.options.href ?? "");
		expect(destination.state.matches.at(-1)?.search).toEqual({
			...(path.endsWith("sample-id") ? { from: "/scrape/history" } : {}),
			mode: "images",
			status: "processing",
			q: "sample",
			sort: "oldest",
			page: 3,
			pageSize: 50,
		});
		if (path.endsWith("sample-id")) {
			expect(loaders.detail).toHaveBeenCalledWith({ data: "sample-id" });
		}
	});

	it.each([
		["/design/scrap?mode=invalid&redirect=https://outside.invalid", {}],
		[
			"/design/scrap/history?mode=invalid&page=-1&pageSize=999&sort=invalid",
			{},
		],
		[
			"/design/scrap/sample-id?from=https://outside.invalid&page=-1&pageSize=999",
			{ from: "/scrape" },
		],
		[
			"/design/scrap/sample-id?from=%2F%2Foutside.invalid&mode=%5B%22html%22%5D",
			{ from: "/scrape" },
		],
	])("drops unsafe or malformed search from %s", async (url, expected) => {
		const router = await normalizedLoad(url);
		const destination = await normalizedLoad(
			router.state.redirect?.options.href ?? "",
		);
		expect(destination.state.matches.at(-1)?.search).toEqual(expected);
	});

	it.each([
		{ route: legacyIndex, target: "/scrape" },
		{ route: legacyDetail, target: "/scrape/$id" },
		{ route: legacyHistory, target: "/scrape/history" },
	])("uses a typed replacement redirect to $target", async ({
		route,
		target,
	}) => {
		let result: unknown;
		try {
			const beforeLoad: unknown = route.options.beforeLoad;
			if (typeof beforeLoad === "function")
				await Reflect.apply(beforeLoad, undefined, [
					{
						params: { id: "sample-id" },
						search: {},
						location: { hash: "results" },
					},
				]);
		} catch (error) {
			result = error;
		}
		expect(isRedirect(result)).toBe(true);
		if (!isRedirect(result)) throw new Error("Legacy route did not redirect");
		expect(result.options.to).toBe(target);
		expect(result.status).toBe(307);
		expect(result.options.replace).toBe(true);
	});
});

describe("workspace entry", () => {
	it.each([
		"/scrape",
		"/scrape/",
		"/scrape?mode=images",
	])("resolves %s to the workspace route without consulting a loader", async (url) => {
		const router = await normalizedLoad(url);
		expect(router.state.matches.at(-1)?.routeId).toBe("/scrape/");
		expect(router.state.redirect).toBeUndefined();
		// The workspace resolves its mode on the client, so no loader runs.
		expect(loaders.detail).not.toHaveBeenCalled();
		expect(loaders.history).not.toHaveBeenCalled();
	});

	it("validates the workspace search when the route is matched", async () => {
		const { Route } = await import("@/routes/scrape/index");
		const validateSearch: unknown = Route.options.validateSearch;
		if (typeof validateSearch !== "function")
			throw new Error("workspace route does not validate its search");
		const apply = (value: unknown) =>
			Reflect.apply(validateSearch, undefined, [value]);

		expect(apply({ mode: "images" })).toEqual({ mode: "images" });
		expect(apply({ mode: "unsupported", injected: 1 })).toEqual({});
		expect(apply(undefined)).toEqual({});
	});
});

describe("neighbor route isolation", () => {
	it.each([
		["/design/studio", "/design/studio/"],
		["/design/studio/sample-id", "/design/studio/$id"],
		["/api/scrape", "/api/scrape"],
		["/api/scrape/preview", "/api/scrape/preview"],
		["/api/scrape/asset", "/api/scrape/asset"],
	])("keeps generated route match for %s", async (url, routeId) => {
		const router = await load(url);
		expect(router.state.matches.at(-1)?.routeId).toBe(routeId);
		expect(router.state.redirect).toBeUndefined();
	});
});
