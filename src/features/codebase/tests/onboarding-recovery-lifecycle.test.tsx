// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useOnboardingAnalysisState } from "../hooks/use-onboarding-analysis-state";
import { useOnboardingRecovery } from "../hooks/use-onboarding-recovery";
import { requestCodebaseStatus } from "../services/onboarding-requests";
import {
	readPlanCodebasePointer,
	storePlanCodebasePointer,
	storePlanCodebaseProjectPointer,
} from "../services/plan-storage";

beforeEach(() => {
	sessionStorage.clear();
	storePlanCodebasePointer("repo", "Repository");
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	sessionStorage.clear();
});

function recovery() {
	const setters = {
		setError: vi.fn(),
		setIsStarting: vi.fn(),
		setCodebase: vi.fn(),
		setRecoveredStatus: vi.fn(),
		setActiveSessionId: vi.fn(),
		setStep: vi.fn(),
		setPayload: vi.fn(),
		setCreditStatus: vi.fn(),
	};
	const hook = renderHook(() => {
		const analysisState = useOnboardingAnalysisState();
		return useOnboardingRecovery({ analysisState, ...setters });
	});
	return { ...hook, setters };
}

test("temporary status errors are not stale repository pointers", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({}, { status: 503 })),
	);
	await expect(requestCodebaseStatus("repo")).rejects.toThrow();
	expect(readPlanCodebasePointer()?.id).toBe("repo");
});

test("network interruption preserves recovery ownership instead of creating a repository", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			throw new TypeError("offline");
		}),
	);
	const { result, setters } = recovery();
	let recovered = false;
	await act(async () => {
		recovered = await result.current();
	});
	expect(recovered).toBe(true);
	expect(readPlanCodebasePointer()?.id).toBe("repo");
	expect(setters.setError).toHaveBeenCalledWith(expect.any(String));
});

test("expired incomplete upload waits for explicit renewal on the same repository", async () => {
	const fetcher = vi.fn(async () =>
		Response.json({
			projectId: "repo",
			sessionId: "expired",
			status: "expired",
			snapshotId: null,
		}),
	);
	vi.stubGlobal("fetch", fetcher);
	const { result, setters } = recovery();
	await act(async () => {
		await result.current();
	});
	expect(fetcher.mock.calls).toHaveLength(1);
	expect(setters.setActiveSessionId).toHaveBeenCalledWith("expired");
	expect(setters.setPayload).not.toHaveBeenCalled();
});

test("an analyzing snapshot restores without a token or duplicate trigger", async () => {
	storePlanCodebaseProjectPointer("project");
	const fetcher = vi.fn(async (input: RequestInfo | URL) =>
		Response.json(
			String(input).includes("/status")
				? {
						projectId: "repo",
						sessionId: "uploaded",
						status: "analyzing",
						snapshotId: "snapshot",
						analysisAttemptStatus: "pending",
					}
				: {
						id: "attempt",
						projectId: "project",
						snapshotId: "snapshot",
						status: "pending",
						output: null,
					},
		),
	);
	vi.stubGlobal("fetch", fetcher);
	const { result, setters } = recovery();
	await act(async () => {
		await result.current();
	});
	expect(setters.setActiveSessionId).toHaveBeenCalledWith("uploaded");
	expect(setters.setPayload).not.toHaveBeenCalled();
	expect(
		fetcher.mock.calls.every(([url]) => !String(url).endsWith("/session")),
	).toBe(true);
});

test("late recovery cannot adopt a different repository after navigation", async () => {
	let resolve!: (response: Response) => void;
	vi.stubGlobal(
		"fetch",
		vi.fn(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				}),
		),
	);
	const { result, setters } = recovery();
	let pending!: Promise<boolean>;
	act(() => {
		pending = result.current();
	});
	storePlanCodebasePointer("new-repo", "New Repository");
	await act(async () => {
		resolve(
			Response.json({
				projectId: "repo",
				sessionId: "old",
				status: "uploading",
			}),
		);
		await pending;
	});
	expect(setters.setCodebase).not.toHaveBeenCalled();
	expect(setters.setActiveSessionId).not.toHaveBeenCalled();
});
