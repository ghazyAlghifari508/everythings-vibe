// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useOnboardingAnalysis } from "../hooks/use-onboarding-analysis";
import { useOnboardingAnalysisState } from "../hooks/use-onboarding-analysis-state";
import { requestOnboardingAnalysis } from "../services/onboarding-requests";
import type { SyncStatusResponse } from "../services/sync";

const status: SyncStatusResponse = {
	projectId: "repo",
	sessionId: "session",
	snapshotId: "snapshot",
	status: "uploaded",
	analysisAttemptId: "failed-attempt",
	analysisAttemptStatus: "failed",
};
afterEach(() => {
	cleanup();
	sessionStorage.clear();
	vi.unstubAllGlobals();
});
function setup() {
	return renderHook(
		({ current }: { current: SyncStatusResponse }) => {
			const state = useOnboardingAnalysisState();
			const actions = useOnboardingAnalysis({
				state,
				codebase: { id: "repo", name: "Repository" },
				lastStatus: current,
				reviewReady: false,
			});
			return { state, actions };
		},
		{ initialProps: { current: status } },
	);
}

test("refresh of failed analysis waits for explicit retry instead of automatically billing again", () => {
	const fetcher = vi.fn(() => new Promise<Response>(() => {}));
	vi.stubGlobal("fetch", fetcher);
	setup();
	expect(fetcher).not.toHaveBeenCalled();
});

test("same-tick retry is single flight on the same snapshot without a sync session", async () => {
	const fetcher = vi.fn(() => new Promise<Response>(() => {}));
	vi.stubGlobal("fetch", fetcher);
	const { result } = setup();
	act(() => {
		result.current.state.setFeatureProjectId("project");
	});
	act(() => {
		result.current.actions.retryAnalysis();
		result.current.actions.retryAnalysis();
	});
	expect(fetcher).toHaveBeenCalledTimes(1);
	expect(fetcher.mock.calls[0]).toEqual([
		"/api/v1/projects/project/codebase/analysis",
		expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ snapshotId: "snapshot" }),
		}),
	]);
	expect(result.current.state.analysisError).toBeNull();
	expect(result.current.state.isAnalysisRetrying).toBe(true);
});

test("a disconnected analysis request waits for server truth, not a fabricated failure", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			throw new TypeError("offline");
		}),
	);
	const { result } = setup();
	act(() => {
		result.current.state.setFeatureProjectId("project");
	});
	await act(async () => {
		result.current.actions.retryAnalysis();
	});
	expect(result.current.state.analysisError).toBeNull();
});

test("late analysis read cannot overwrite a cleared session", async () => {
	let resolve!: (value: Response) => void;
	vi.stubGlobal(
		"fetch",
		vi.fn(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				}),
		),
	);
	const { result } = renderHook(() => useOnboardingAnalysisState());
	let pending!: Promise<unknown>;
	act(() => {
		pending = result.current.fetchAnalysisOutput("project", "snapshot");
	});
	act(() => {
		result.current.setAnalysis(null);
		result.current.setFeatureProjectId(null);
	});
	await act(async () => {
		resolve(
			Response.json({
				id: "old",
				projectId: "project",
				snapshotId: "snapshot",
				status: "failed",
				output: null,
			}),
		);
		await pending;
	});
	expect(result.current.analysis).toBeNull();
});

test("a server-owned concurrent attempt is monitored instead of reported failed", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({ code: "ANALYSIS_IN_PROGRESS" }, { status: 409 }),
		),
	);
	expect(
		await requestOnboardingAnalysis({
			projectId: "project",
			snapshotId: "snapshot",
		}),
	).toMatchObject({ kind: "pending" });
	const { result } = setup();
	act(() => {
		result.current.state.setFeatureProjectId("project");
	});
	await act(async () => {
		result.current.actions.retryAnalysis();
	});
	expect(result.current.state.analysisError).toBeNull();
});
