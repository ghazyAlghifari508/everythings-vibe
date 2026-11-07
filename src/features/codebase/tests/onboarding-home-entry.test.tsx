// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useHomeProjectCreation } from "@/components/layout/chat-input/use-home-project-creation";

const navigation = vi.hoisted(() => ({
	navigate: vi.fn(),
	refetch: vi.fn(async () => ({ data: { remaining: 30 } })),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigation.navigate,
}));
vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => ({ data: { remaining: 30 }, refetch: navigation.refetch }),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "owner" } } }) },
}));
afterEach(() => {
	cleanup();
	sessionStorage.clear();
	vi.unstubAllGlobals();
	navigation.navigate.mockClear();
});

test("Home Existing Codebase navigates without creating repositories or storing credentials", async () => {
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	const hook = renderHook(() => useHomeProjectCreation());
	act(() => {
		hook.result.current.handleModeChange("existing_codebase");
	});
	act(() => {
		hook.result.current.setMessage(
			"Add a reliable checkout feature to this existing repository",
		);
	});
	await act(async () => {
		await hook.result.current.handleSend();
	});
	expect(navigation.navigate).toHaveBeenCalledWith({
		to: "/plan/codebase",
		search: { intent: "new" },
	});
	expect(fetcher).not.toHaveBeenCalled();
	expect(hook.result.current.isSending).toBe(false);
});

test("Home Greenfield still creates a project and opens its Ask flow", async () => {
	const fetcher = vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			Response.json({ id: "greenfield", projectMode: "greenfield" }),
	);
	vi.stubGlobal("fetch", fetcher);
	const hook = renderHook(() => useHomeProjectCreation());
	act(() => {
		hook.result.current.setMessage(
			"Build a new inventory management application for a small store",
		);
	});
	await act(async () => {
		await hook.result.current.handleSend();
	});
	expect(fetcher.mock.calls[0]?.[0]).toBe("/api/projects");
	expect(navigation.navigate).toHaveBeenCalledWith({
		to: "/ask/$id",
		params: { id: "greenfield" },
	});
	expect(hook.result.current.promptError).toBe("");
});
