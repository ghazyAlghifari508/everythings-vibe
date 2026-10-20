import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route as DesignIdRoute } from "@/routes/design/$id";
import {
	Route as DesignIndexRoute,
	studioSearchSchema,
} from "@/routes/design/index";
import { routeTree } from "@/routeTree.gen";

function getRouter(url = "/design") {
	const history = createMemoryHistory({ initialEntries: [url] });
	return createRouter({
		routeTree,
		history,
		isServer: true,
		context: { queryClient: new QueryClient() },
	});
}

describe("Studio Canonical Routing", () => {
	it("registers canonical /design route with StudioLandingPage component and search schema", async () => {
		expect(DesignIndexRoute.options.component).toBeDefined();
		expect(DesignIndexRoute.options.validateSearch).toBeDefined();

		const parsed = studioSearchSchema.parse({
			prompt: "Dashboard Finance",
			from: "/",
		});
		expect(parsed).toEqual({
			prompt: "Dashboard Finance",
			from: "/",
		});

		const router = getRouter("/design");
		await router.load();
		expect(router.state.matches.at(-1)?.routeId).toBe("/design/");
	});

	it("registers canonical /design/$id route with StudioWorkspace component and errorComponent", async () => {
		expect(DesignIdRoute.options.component).toBeDefined();
		expect(DesignIdRoute.options.errorComponent).toBeDefined();
		expect(DesignIdRoute.options.loader).toBeDefined();

		const router = getRouter("/design/project-123");
		await router.load();
		expect(router.state.matches.at(-1)?.routeId).toBe("/design/$id");
	});

	it("does not contain legacy /design/studio routes anywhere in router routes", () => {
		const router = getRouter("/design");
		const allRouteIds = Object.keys(router.routesById);
		expect(allRouteIds).toContain("/design/");
		expect(allRouteIds).toContain("/design/$id");
		expect(allRouteIds).not.toContain("/design/studio");
		expect(allRouteIds).not.toContain("/design/studio/");
		expect(allRouteIds).not.toContain("/design/studio/$id");

		for (const id of allRouteIds) {
			expect(id).not.toContain("/design/studio");
		}
	});

	it("preserves independent /scrape routes and legacy /design/scrap routes in routeTree", () => {
		const router = getRouter("/scrape");
		const allRouteIds = Object.keys(router.routesById);
		expect(allRouteIds.some((id) => id.startsWith("/scrape"))).toBe(true);
		expect(allRouteIds.some((id) => id.startsWith("/design/scrap"))).toBe(true);
	});
});
