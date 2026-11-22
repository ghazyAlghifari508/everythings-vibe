// @vitest-environment jsdom
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceSync } from "../hooks/use-workspace-sync";

const server = vi.hoisted(() => ({
	// Loads before this call number see the stale snapshot (no PRD yet).
	freshFromCall: 2,
	calls: 0,
}));

function Child({ childHasPrd }: { childHasPrd: boolean }) {
	useWorkspaceSync("p1", "hasPrd", childHasPrd);
	return <div>child</div>;
}

function mount(childHasPrd: boolean) {
	const root = createRootRoute({ component: Outlet });
	const workspace = createRoute({
		getParentRoute: () => root,
		path: "/vibeplan/$id",
		loader: () => {
			server.calls += 1;
			return { hasPrd: server.calls >= server.freshFromCall, hasAc: false };
		},
		component: function Shell() {
			const data = workspace.useLoaderData();
			return (
				<div>
					<span data-testid="parent">{String(data.hasPrd)}</span>
					<Outlet />
				</div>
			);
		},
	});
	const prd = createRoute({
		getParentRoute: () => workspace,
		path: "prd",
		component: () => <Child childHasPrd={childHasPrd} />,
	});
	const router = createRouter({
		routeTree: root.addChildren([workspace.addChildren([prd])]),
		history: createMemoryHistory({ initialEntries: ["/vibeplan/p1/prd"] }),
	});
	render(<RouterProvider router={router} />);
}

beforeEach(() => {
	server.freshFromCall = 2;
	server.calls = 0;
});
afterEach(cleanup);

it("refreshes a stale parent snapshot once when the child already holds the saved PRD", async () => {
	mount(true);
	await screen.findByText("child");
	await waitFor(() =>
		expect(screen.getByTestId("parent").textContent).toBe("true"),
	);
	expect(server.calls).toBe(2);
});

it("does not poll: a snapshot that stays stale triggers a single revalidation", async () => {
	server.freshFromCall = Number.POSITIVE_INFINITY;
	mount(true);
	await waitFor(() => expect(server.calls).toBe(2));
	await new Promise((r) => setTimeout(r, 150));
	expect(server.calls).toBe(2);
	expect(screen.getByTestId("parent").textContent).toBe("false");
});

it("does not revalidate when the child has no saved PRD", async () => {
	server.freshFromCall = Number.POSITIVE_INFINITY;
	mount(false);
	await screen.findByText("child");
	await new Promise((r) => setTimeout(r, 100));
	expect(server.calls).toBe(1);
});
