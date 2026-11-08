// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Route as LegacyPrdRoute } from "@/routes/prd/$id";
import { Route as EntryRoute } from "@/routes/vibeplan/$id/index";
import { Route as WorkspaceRoute } from "@/routes/vibeplan/$id/route";
import { useChatStore, useUIStore } from "@/store";
import { useGenerationNavigationGuard } from "../hooks/use-generation-navigation-guard";

const state = vi.hoisted(() => ({
	projectId: "fca689ff-e194-45eb-b6fa-0188cc327759",
	projectName: "Project A",
	projectMode: "greenfield",
	codebaseId: null,
	step: "prd",
	lastUrl: null as string | null,
	hasFeatures: true,
	hasPrd: true,
	hasAc: true,
	hasTasks: true,
	hasHandoff: true,
	featuresStatus: "completed",
	acStatus: "completed",
	taskStatus: "completed",
	progress: "task",
	childError: false,
	active: false,
	error: "",
}));
vi.mock("../services/workspace-loader.functions", () => ({
	loadWorkspace: async () => {
		if (state.error) throw new Error(state.error);
		return state;
	},
}));
vi.mock("../hooks/use-last-route", () => ({ useLastRoute: () => () => {} }));

function Stage({ name }: { name: string }) {
	const [active, setActive] = useState(state.active);
	useGenerationNavigationGuard(active);
	return (
		<div>
			{name}
			<button type="button" onClick={() => setActive(false)}>
				Complete stream
			</button>
		</div>
	);
}
function setup(path: string) {
	const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
		component: Outlet,
	});
	const workspace = createRoute({
		...WorkspaceRoute.options,
		path: "/vibeplan/$id",
		getParentRoute: () => root,
	});
	const entry = createRoute({
		...EntryRoute.options,
		path: "/",
		getParentRoute: () => workspace,
	});
	const legacy = createRoute({
		...LegacyPrdRoute.options,
		path: "/prd/$id",
		getParentRoute: () => root,
	});
	const ask = createRoute({
		getParentRoute: () => workspace,
		path: "ask",
		component: () => <Stage name="Ask stage" />,
	});
	const prd = createRoute({
		getParentRoute: () => workspace,
		path: "prd",
		component: () => <Stage name="PRD stage" />,
	});
	const task = createRoute({
		getParentRoute: () => workspace,
		path: "task",
		loader: () => {
			if (state.childError) throw new Error("Child unavailable");
		},
		errorComponent: () => <div role="alert">Child unavailable</div>,
		component: () => <Stage name="Task stage" />,
	});
	const login = createRoute({
		getParentRoute: () => root,
		path: "login",
		component: () => <div>Login</div>,
	});
	const router = createRouter({
		context: { queryClient: new QueryClient() },
		routeTree: root.addChildren([
			workspace.addChildren([entry, ask, prd, task]),
			legacy,
			login,
		]),
		history: createMemoryHistory({ initialEntries: [path] }),
		defaultPendingMs: 0,
	});
	render(<RouterProvider router={router} />);
	return router;
}
beforeEach(() => {
	vi.spyOn(window, "scrollTo").mockImplementation(() => {});
	state.active = false;
	state.error = "";
	state.lastUrl = null;
	state.childError = false;
	state.hasFeatures = true;
	state.hasPrd = true;
	state.hasAc = true;
	state.hasTasks = true;
	state.hasHandoff = true;
	state.featuresStatus = "completed";
	useChatStore.getState().resetChat();
	useUIStore.getState().hideToast();
});
afterEach(cleanup);

it("keeps the actual workspace shell mounted across child navigation and history", async () => {
	const router = setup(`/vibeplan/${state.projectId}/ask`);
	await screen.findByText("Ask stage");
	const shell = screen.getByRole("region", { name: "VibePlan workspace" });
	await act(() =>
		router.navigate({ href: `/vibeplan/${state.projectId}/prd` }),
	);
	await screen.findByText("PRD stage");
	expect(screen.getByRole("region", { name: "VibePlan workspace" })).toBe(
		shell,
	);
	await act(async () => router.history.back());
	await screen.findByText("Ask stage");
	expect(screen.getByRole("region", { name: "VibePlan workspace" })).toBe(
		shell,
	);
	await act(async () => router.history.forward());
	await screen.findByText("PRD stage");
	expect(screen.getByRole("region", { name: "VibePlan workspace" })).toBe(
		shell,
	);
});
it("normalizes a legacy payment link without forwarding untrusted search", async () => {
	const router = setup(
		`/prd/${state.projectId}?order_id=order-1&payment=success&redirect=https://evil.test`,
	);
	await screen.findByText("PRD stage");
	expect(router.state.location.pathname).toBe(
		`/vibeplan/${state.projectId}/prd`,
	);
	expect(router.state.location.search).toEqual({
		order_id: "order-1",
		payment: "success",
	});
});
it("resumes verified artifacts instead of default step", async () => {
	const router = setup(`/vibeplan/${state.projectId}`);
	await screen.findByText("Task stage");
	expect(router.state.location.pathname).toBe(
		`/vibeplan/${state.projectId}/task`,
	);
});
it("blocks departure while the stream owns the view, then permits it after completion", async () => {
	state.active = true;
	const router = setup(`/vibeplan/${state.projectId}/prd`);
	await screen.findByText("PRD stage");
	act(() => {
		router.history.push(`/vibeplan/${state.projectId}/ask`);
	});
	await waitFor(() =>
		expect(useUIStore.getState().toastMessage).not.toBeNull(),
	);
	expect(router.state.location.pathname).toBe(
		`/vibeplan/${state.projectId}/prd`,
	);
	expect(screen.queryByText("Ask stage")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Complete stream" }));
	await act(() =>
		router.navigate({ href: `/vibeplan/${state.projectId}/ask` }),
	);
	await screen.findByText("Ask stage");
});
it("redirects anonymous users before rendering project metadata", async () => {
	state.error = "Unauthorized";
	const router = setup(`/vibeplan/${state.projectId}/prd`);
	await screen.findByText("Login");
	expect(router.state.location.search).toEqual({
		redirect: `/vibeplan/${state.projectId}/prd`,
	});
	expect(screen.queryByText("Project A")).toBeNull();
});
it("does not disclose a foreign or deleted project's metadata", async () => {
	state.error = "NOT_FOUND";
	setup(`/vibeplan/${state.projectId}/prd`);
	await screen.findByText("Proyek tidak ditemukan.");
	expect(screen.queryByText("Project A")).toBeNull();
});

it("keeps the shell when a child loader fails", async () => {
	const router = setup(`/vibeplan/${state.projectId}/ask`);
	await screen.findByText("Ask stage");
	const shell = screen.getByRole("region", { name: "VibePlan workspace" });
	state.childError = true;
	await act(() =>
		router.navigate({ href: `/vibeplan/${state.projectId}/task` }),
	);
	await screen.findByRole("alert");
	expect(screen.getByRole("region", { name: "VibePlan workspace" })).toBe(
		shell,
	);
});

it("clears stale project state before mounting a new workspace view", async () => {
	useChatStore.getState().setActiveProject("foreign");
	useChatStore.getState().setMessages([
		{
			id: "old",
			role: "assistant",
			content: "Private old project",
			timestamp: 0,
		},
	]);
	useChatStore.getState().setStreamingPRDContent("Old stream");
	setup(`/vibeplan/${state.projectId}/ask`);
	await screen.findByText("Ask stage");
	expect(useChatStore.getState().activeProjectId).toBe(state.projectId);
	expect(useChatStore.getState().messages).toEqual([]);
	expect(useChatStore.getState().streamingPRDContent).toBe("");
});

it("redirects a locked direct child to Ask without rendering the locked view", async () => {
	state.hasFeatures = false;
	state.hasPrd = false;
	state.hasAc = false;
	state.hasTasks = false;
	state.hasHandoff = false;
	state.featuresStatus = "pending";
	const router = setup(`/vibeplan/${state.projectId}/task`);
	await screen.findByText("Ask stage");
	expect(router.state.location.pathname).toBe(
		`/vibeplan/${state.projectId}/ask`,
	);
	expect(screen.queryByText("Task stage")).toBeNull();
});
