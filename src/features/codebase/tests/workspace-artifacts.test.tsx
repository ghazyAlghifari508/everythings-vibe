// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceArtifacts } from "../hooks/use-workspace-artifacts";

vi.mock("../services/workspace-artifacts.functions", () => ({
	loadFeatureTree: vi.fn(async () => ({ featureTree: null })),
	loadTaskTree: vi.fn(async () => ({ taskTree: null })),
}));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("workspace artifact hydration", () => {
	it("keeps unread documents pending until a snapshot is usable", () => {
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		const { result, unmount } = renderHook(() =>
			useWorkspaceArtifacts(false, null),
		);
		expect(result.current.artifactHydration).toEqual({
			feature: "pending",
			prd: "pending",
			ac: "pending",
			tasks: "pending",
		});
		expect(fetcher).not.toHaveBeenCalled();
		unmount();
	});

	it("distinguishes empty persisted documents from failed reads and permits recovery", async () => {
		let failed = true;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				return url.endsWith("/versions") && failed
					? Response.json({ error: "unavailable" }, { status: 503 })
					: Response.json([]);
			}),
		);
		const { result, unmount } = renderHook(() =>
			useWorkspaceArtifacts(true, "plan-a"),
		);
		await waitFor(() =>
			expect(result.current.artifactHydration).toEqual({
				feature: "empty",
				prd: "failed",
				ac: "empty",
				tasks: "empty",
			}),
		);
		expect(result.current.prdError).not.toBeNull();
		failed = false;
		await act(async () => {
			await result.current.loadPrd();
		});
		expect(result.current.artifactHydration.prd).toBe("empty");
		expect(result.current.prdError).toBeNull();
		unmount();
	});

	it("ignores a late document response after switching plans", async () => {
		let resolveOld: (response: Response) => void = () => {};
		const old = new Promise<Response>((resolve) => {
			resolveOld = resolve;
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				url === "/api/projects/plan-a/versions" ? old : Response.json([]),
			),
		);
		const { result, rerender, unmount } = renderHook(
			({ id }) => useWorkspaceArtifacts(true, id),
			{ initialProps: { id: "plan-a" } },
		);
		rerender({ id: "plan-b" });
		await waitFor(() =>
			expect(result.current.artifactHydration.prd).toBe("empty"),
		);
		await act(async () => {
			resolveOld(Response.json([{ version: 1, content: "old plan" }]));
			await old;
		});
		expect(result.current.prdContent).toBeNull();
		expect(result.current.artifactHydration.prd).toBe("empty");
		unmount();
	});
});
