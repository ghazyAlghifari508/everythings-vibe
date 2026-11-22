// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Navbar } from "@/components/layout/navbar";
import { Route as LegacyPrdRoute } from "@/routes/prd/$id";
import { Route as WorkspaceRoute } from "@/routes/vibeplan/$id/route";
import { useChatStore, useUIStore } from "@/store";
import { useWorkspaceSync } from "../hooks/use-workspace-sync";

interface Fixture {
	step: string;
	hasPrd: boolean;
	hasAc: boolean;
	hasTasks: boolean;
	/** Loader calls before this number see the pre-save snapshot (no PRD). */
	freshFromCall: number;
	/** What the child loader already holds (persisted PRD). */
	childHasPrd: boolean;
	calls: number;
}
const world = vi.hoisted(() => ({
	projects: {} as Record<string, unknown>,
	plan: "pro" as "free" | "pro",
	stepStatus: 200,
}));
const fx = (id: string) => world.projects[id] as Fixture;

vi.mock("../services/workspace-loader.functions", () => ({
	loadWorkspace: async ({ data: id }: { data: string }) => {
		const f = fx(id);
		f.calls += 1;
		const hasPrd = f.hasPrd && f.calls >= f.freshFromCall;
		return {
			projectId: id,
			projectName: `Project ${id}`,
			projectMode: "greenfield",
			codebaseId: null,
			step: f.step,
			lastUrl: null,
			hasFeatures: true,
			hasPrd,
			hasAc: f.hasAc,
			hasTasks: f.hasTasks,
			hasHandoff: true,
			featuresStatus: "completed",
			acStatus: f.hasAc ? "completed" : "pending",
			taskStatus: f.hasTasks ? "completed" : "pending",
			progress: f.hasTasks ? "task" : f.hasAc ? "ac" : hasPrd ? "prd" : "fitur",
		};
	},
}));
vi.mock("../hooks/use-last-route", () => ({ useLastRoute: () => () => {} }));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: { user: { id: "u1", email: "u1@test.com" } },
			isPending: false,
		}),
		signOut: vi.fn(async () => {}),
	},
}));
vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => ({
		data: { plan: world.plan, topUpEligible: false },
	}),
}));
vi.mock("@/features/billing/components/top-up-modal", () => ({
	TopUpModal: () => null,
}));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => null }));

function seed(id: string, over: Partial<Fixture> = {}) {
	world.projects[id] = {
		step: "fitur",
		hasPrd: true,
		hasAc: false,
		hasTasks: false,
		freshFromCall: 2,
		childHasPrd: true,
		calls: 0,
		...over,
	} satisfies Fixture;
}

function PrdChild() {
	const { id } = prd.useParams();
	useWorkspaceSync(id, "hasPrd", fx(id).childHasPrd);
	return <div>PRD view {id}</div>;
}

const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	component: () => (
		<>
			<Navbar onOpenDrawer={() => {}} />
			<Outlet />
		</>
	),
});
const workspace = createRoute({
	...WorkspaceRoute.options,
	path: "/vibeplan/$id",
	getParentRoute: () => root,
});
const legacyPrd = createRoute({
	...LegacyPrdRoute.options,
	path: "/prd/$id",
	getParentRoute: () => root,
});
const prd = createRoute({
	getParentRoute: () => workspace,
	path: "prd",
	component: PrdChild,
});
const ac = createRoute({
	getParentRoute: () => workspace,
	path: "ac",
	component: () => <div>AC view</div>,
});
const task = createRoute({
	getParentRoute: () => workspace,
	path: "task",
	component: () => <div>Task view</div>,
});

let fetchMock: ReturnType<typeof vi.fn>;
function mount(path: string) {
	const router = createRouter({
		context: { queryClient: new QueryClient() },
		routeTree: root.addChildren([
			workspace.addChildren([prd, ac, task]),
			legacyPrd,
		]),
		history: createMemoryHistory({ initialEntries: [path] }),
		defaultPendingMs: 0,
	});
	render(
		<QueryClientProvider client={new QueryClient()}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	return router;
}
const cta = (name: RegExp) => screen.findByRole("button", { name });

beforeEach(() => {
	world.projects = {};
	world.plan = "pro";
	world.stepStatus = 200;
	vi.spyOn(window, "scrollTo").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	fetchMock = vi.fn(async () => ({
		ok: world.stepStatus >= 200 && world.stepStatus < 300,
		status: world.stepStatus,
		json: async () => ({}),
	}));
	vi.stubGlobal("fetch", fetchMock);
	useChatStore.getState().resetChat();
	useUIStore.getState().hideToast();
	useUIStore.getState().closePaywallModal();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it("stale parent (step=fitur, PRD saved) resyncs, then Generate AC advances once to the canonical AC route", async () => {
	seed("p1");
	const router = mount("/vibeplan/p1/prd");
	const button = await cta(/Generate AC/i);
	expect(
		screen.queryByRole("button", { name: /Kembali ke Fitur/i }),
	).toBeNull();
	await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
	expect(fx("p1").calls).toBe(2);

	fireEvent.click(button);
	fireEvent.click(button);
	await waitFor(() =>
		expect(router.state.location.pathname).toBe("/vibeplan/p1/ac"),
	);
	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(fetchMock.mock.calls[0][0]).toBe("/api/projects/p1/step");
	expect(
		JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)),
	).toEqual({ step: "ac" });
});

it("a 409 from the step endpoint stays on /prd, revalidates the parent and reports the error", async () => {
	seed("p1");
	world.stepStatus = 409;
	const router = mount("/vibeplan/p1/prd");
	const button = await cta(/Generate AC/i);
	await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
	const callsBefore = fx("p1").calls;
	fireEvent.click(button);
	await waitFor(() =>
		expect(useUIStore.getState().toastMessage).not.toBeNull(),
	);
	expect(useUIStore.getState().toastType).toBe("error");
	expect(router.state.location.pathname).toBe("/vibeplan/p1/prd");
	await waitFor(() => expect(fx("p1").calls).toBeGreaterThan(callsBefore));
});

it("a 403 from the step endpoint opens the paywall instead of navigating", async () => {
	seed("p1");
	world.stepStatus = 403;
	const router = mount("/vibeplan/p1/prd");
	const button = await cta(/Generate AC/i);
	await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
	fireEvent.click(button);
	await waitFor(() => expect(useUIStore.getState().isPaywallOpen).toBe(true));
	expect(useUIStore.getState().paywallStage).toBe("ac");
	expect(router.state.location.pathname).toBe("/vibeplan/p1/prd");
});

it("keeps Generate AC disabled while the PRD stream is still running", async () => {
	seed("p1", { freshFromCall: 1 });
	// The workspace shell resets chat state when the active project changes, so
	// the stream flag is set for the project that is already active.
	useChatStore.getState().setActiveProject("p1");
	useChatStore.getState().setGeneratingPRD(true);
	mount("/vibeplan/p1/prd");
	const button = await cta(/Generate AC/i);
	expect(button.hasAttribute("disabled")).toBe(true);
	fireEvent.click(button);
	expect(fetchMock).not.toHaveBeenCalled();
});

it("refresh/resume with a persisted PRD is immediately eligible and never writes progress by viewing", async () => {
	seed("p1", { freshFromCall: 1 });
	mount("/vibeplan/p1/prd");
	const button = await cta(/Generate AC/i);
	expect(button.hasAttribute("disabled")).toBe(false);
	expect(fx("p1").calls).toBe(1);
	expect(fetchMock).not.toHaveBeenCalled();
});

it("revisiting the PRD of a project that reached Task keeps progress and offers the existing Task view", async () => {
	seed("p1", {
		hasPrd: true,
		hasAc: true,
		hasTasks: true,
		step: "task",
		freshFromCall: 1,
	});
	mount("/vibeplan/p1/prd");
	expect(await cta(/Lanjut ke Task/i)).toBeDefined();
	expect(screen.queryByRole("button", { name: /Generate AC/i })).toBeNull();
	expect(fetchMock).not.toHaveBeenCalled();
});

it("an existing AC opens instead of regenerating", async () => {
	seed("p1", { hasAc: true, step: "ac", freshFromCall: 1 });
	mount("/vibeplan/p1/prd");
	expect(await cta(/Lanjut ke AC/i)).toBeDefined();
	expect(screen.queryByRole("button", { name: /Generate AC/i })).toBeNull();
});

it("free plans see the upgrade CTA, never Generate AC", async () => {
	seed("p1", { freshFromCall: 1 });
	world.plan = "free";
	mount("/vibeplan/p1/prd");
	expect(await cta(/Upgrade ke Pro/i)).toBeDefined();
	expect(screen.queryByRole("button", { name: /Generate AC/i })).toBeNull();
});

it("switching projects never shows the previous project's eligibility", async () => {
	seed("p1", { freshFromCall: 1 });
	seed("p2", { hasPrd: false, childHasPrd: false });
	const router = mount("/vibeplan/p1/prd");
	const first = await cta(/Generate AC/i);
	await waitFor(() => expect(first.hasAttribute("disabled")).toBe(false));

	await router.navigate({ to: "/vibeplan/$id/prd", params: { id: "p2" } });
	await screen.findByText("PRD view p2");
	const second = await cta(/Generate AC/i);
	expect(second.hasAttribute("disabled")).toBe(true);
	fireEvent.click(second);
	expect(fetchMock).not.toHaveBeenCalled();
});

it("on /ac, Generate Task stays disabled until the AC is persisted", async () => {
	seed("p1", { hasAc: false, step: "prd", freshFromCall: 1 });
	mount("/vibeplan/p1/ac");
	const button = await cta(/Menyusun AC/i);
	expect(button.hasAttribute("disabled")).toBe(true);
	fireEvent.click(button);
	expect(fetchMock).not.toHaveBeenCalled();
});

it("on /ac, a persisted AC enables Generate Task, which advances once to the canonical Task route", async () => {
	seed("p1", { hasAc: true, step: "ac", freshFromCall: 1 });
	const router = mount("/vibeplan/p1/ac");
	const button = await cta(/Generate Task/i);
	expect(button.hasAttribute("disabled")).toBe(false);
	fireEvent.click(button);
	fireEvent.click(button);
	await waitFor(() =>
		expect(router.state.location.pathname).toBe("/vibeplan/p1/task"),
	);
	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(
		JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)),
	).toEqual({ step: "task" });
});

it("on /ac, existing tasks open instead of regenerating and viewing never writes progress", async () => {
	seed("p1", { hasAc: true, hasTasks: true, step: "task", freshFromCall: 1 });
	mount("/vibeplan/p1/ac");
	expect(await cta(/Lanjut ke Task/i)).toBeDefined();
	expect(screen.queryByRole("button", { name: /Generate Task/i })).toBeNull();
	expect(fetchMock).not.toHaveBeenCalled();
});

it("a legacy /prd/$id URL lands on the canonical route and derives the CTA from that project only", async () => {
	seed("p1", { freshFromCall: 1 });
	seed("p2", { hasPrd: false, childHasPrd: false });
	const router = mount("/prd/p2");
	await waitFor(() =>
		expect(router.state.location.pathname).toBe("/vibeplan/p2/prd"),
	);
	const button = await cta(/Generate AC/i);
	expect(button.hasAttribute("disabled")).toBe(true);
	expect(fx("p1").calls).toBe(0);
});
