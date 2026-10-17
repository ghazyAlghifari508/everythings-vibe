// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import { useWorkspaceAnalysis } from "../hooks/use-workspace-analysis";

afterEach(() => vi.unstubAllGlobals());
const initialAnalysis: AnalysisResponse = {
	id: "analysis-a",
	projectId: "plan-a",
	snapshotId: "snapshot-a",
	status: "ready",
	output: { projectId: "plan-a", snapshotId: "snapshot-a" },
};

describe("workspace analysis lifecycle", () => {
	it("reopening reads no billable analysis and retains matching persisted analysis", () => {
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		const { result, unmount } = renderHook(() =>
			useWorkspaceAnalysis({
				projectId: "plan-a",
				currentSnapshotId: "snapshot-a",
				polledSnapshotId: null,
				initialAnalysis,
				setError: vi.fn(),
				setIsWorking: vi.fn(),
			}),
		);
		expect(result.current.analysis).toEqual(initialAnalysis);
		expect(fetcher).not.toHaveBeenCalled();
		unmount();
	});
	it("deduplicates reads and discards an answer for a superseded snapshot", async () => {
		let finish: (response: Response) => void = () => {};
		const response = new Promise<Response>((resolve) => {
			finish = resolve;
		});
		const fetcher = vi.fn(() => response);
		vi.stubGlobal("fetch", fetcher);
		const setError = vi.fn();
		const setIsWorking = vi.fn();
		const { result, rerender, unmount } = renderHook(
			({ snapshot }) =>
				useWorkspaceAnalysis({
					projectId: "plan-a",
					currentSnapshotId: snapshot,
					polledSnapshotId: null,
					initialAnalysis,
					setError,
					setIsWorking,
				}),
			{ initialProps: { snapshot: "snapshot-a" } },
		);
		let read: Promise<void> = Promise.resolve();
		act(() => {
			read = result.current.readWorkspaceAnalysis("plan-a", "snapshot-a");
			void result.current.readWorkspaceAnalysis("plan-a", "snapshot-a");
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
		rerender({ snapshot: "snapshot-b" });
		await act(async () => {
			finish(Response.json(initialAnalysis));
			await read;
		});
		expect(result.current.analysis).toBeNull();
		expect(setError).not.toHaveBeenCalled();
		unmount();
	});
});
