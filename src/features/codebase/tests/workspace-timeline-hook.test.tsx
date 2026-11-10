// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceTimeline } from "../hooks/use-workspace-timeline";
import type { WorkspaceEvent } from "../types/workspace-timeline";

const { load, save } = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../services/workspace-timeline.functions", () => ({
	loadWorkspaceTimeline: load,
	saveWorkspaceMessage: save,
}));
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
const row = (projectId: string): WorkspaceEvent => ({
	id: `prompt:${projectId}`,
	projectId,
	codebaseId: "repo",
	type: "user_message",
	stage: "questions",
	content: projectId,
	status: "completed",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});
it("rehydrates A to B to A and ignores late A completion while B is selected", async () => {
	let finishA: (value: { events: WorkspaceEvent[] }) => void = () => {};
	load.mockImplementation(({ data }: { data: { projectId: string } }) =>
		data.projectId === "a"
			? new Promise<{ events: WorkspaceEvent[] }>((resolve) => {
					finishA = resolve;
				})
			: Promise.resolve({ events: [row("b")] }),
	);
	const { result, rerender } = renderHook(
		({ id }) => useWorkspaceTimeline("repo", id),
		{ initialProps: { id: "a" } },
	);
	expect(result.current.status).toBe("pending");
	rerender({ id: "b" });
	await waitFor(() =>
		expect(result.current.events.map((e) => e.projectId)).toEqual(["b"]),
	);
	await act(async () => finishA({ events: [row("a")] }));
	expect(result.current.events.map((e) => e.projectId)).toEqual(["b"]);
	load.mockResolvedValue({ events: [row("a")] });
	rerender({ id: "a" });
	expect(result.current.events).toEqual([]);
	await waitFor(() =>
		expect(result.current.events.map((e) => e.projectId)).toEqual(["a"]),
	);
});
it("reports failed hydration without claiming an empty workspace, and retries", async () => {
	load.mockRejectedValue(new Error("offline"));
	const { result } = renderHook(() => useWorkspaceTimeline("repo", "a"));
	await waitFor(() => expect(result.current.status).toBe("failed"));
	load.mockResolvedValue({ events: [row("a")] });
	await act(async () => {
		await result.current.refreshTimeline();
	});
	expect(result.current.status).toBe("ready");
	expect(result.current.events.map((e) => e.id)).toEqual(["prompt:a"]);
});
it("reopens from server state rather than local messages", async () => {
	load.mockResolvedValue({ events: [row("a")] });
	const first = renderHook(() => useWorkspaceTimeline("repo", "a"));
	await waitFor(() => expect(first.result.current.status).toBe("ready"));
	first.unmount();
	const reopened = renderHook(() => useWorkspaceTimeline("repo", "a"));
	await waitFor(() =>
		expect(reopened.result.current.events).toEqual([row("a")]),
	);
});
