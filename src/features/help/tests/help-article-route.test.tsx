// @vitest-environment jsdom

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HELP_ARTICLES } from "../data/articles";

// The real route tree pulls in every route module; only the Help routes carry
// the nesting under test, so every other route is replaced with an inert stub.
const root = createRootRoute({ component: () => <Outlet /> });
const routesDirectory = resolve("src/routes");
const REAL_ROUTES: Record<string, true> = {
	"bantuan.tsx": true,
	"bantuan.$categoryId.tsx": true,
	"bantuan.$categoryId.$articleId.tsx": true,
};

for (const file of readdirSync(routesDirectory, { recursive: true })) {
	const relative = String(file).replaceAll("\\", "/");
	if (!/\.tsx?$/.test(relative) || REAL_ROUTES[relative]) continue;
	vi.doMock(resolve(routesDirectory, relative), () => ({
		Route:
			relative === "__root.tsx"
				? root
				: createRoute({ id: relative, getParentRoute: () => root }),
	}));
}

const { routeTree } = await import("@/routeTree.gen");

afterEach(cleanup);

it("renders the selected help article on direct navigation", async () => {
	const article = HELP_ARTICLES.find((item) => item.id === "cara-kerja-kredit");
	if (!article) throw new Error("Expected billing article fixture to exist");

	const router = createRouter({
		routeTree,
		context: { queryClient: new QueryClient() },
		history: createMemoryHistory({
			initialEntries: [`/bantuan/${article.categoryId}/${article.id}`],
		}),
	});
	await router.load();
	render(<RouterProvider router={router} />);

	expect(
		await screen.findByRole("heading", { name: article.title }),
	).toBeTruthy();
});
