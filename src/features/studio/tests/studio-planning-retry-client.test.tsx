// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioPlanningRetry } from "../hooks/use-studio-planning-retry";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("blocks double clicks until backend synchronization completes", async () => {
	const request = Promise.withResolvers<Response>();
	const sync = Promise.withResolvers<void>();
	const fetchMock = vi.fn(() => request.promise);
	vi.stubGlobal("fetch", fetchMock);
	const { result } = renderHook(() =>
		useStudioPlanningRetry({
			projectId: "p",
			canRetryPlanning: true,
			syncProjectStatus: () => sync.promise,
			setError: vi.fn(),
		}),
	);
	let first: Promise<void>;
	act(() => {
		first = result.current.handleRetryPlanning();
	});
	expect(result.current.retryingPlanning).toBe(true);
	await act(async () => {
		await result.current.handleRetryPlanning();
		request.resolve(Response.json({ job: { status: "queued" } }));
	});
	await act(async () => {
		await result.current.handleRetryPlanning();
	});
	expect(fetchMock).toHaveBeenCalledTimes(1);
	await act(async () => {
		sync.resolve();
		await first;
	});
	expect(result.current.retryingPlanning).toBe(false);
});

it("does not submit without confirmed planning failure", async () => {
	const fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
	const { result } = renderHook(() =>
		useStudioPlanningRetry({
			projectId: "p",
			canRetryPlanning: false,
			syncProjectStatus: vi.fn(),
			setError: vi.fn(),
		}),
	);
	await act(async () => {
		await result.current.handleRetryPlanning();
	});
	expect(fetchMock).not.toHaveBeenCalled();
});

it("resynchronizes a running rejection without reporting another AI failure or leaking raw errors", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json(
				{ code: "STUDIO_RETRY_RUNNING", error: "provider secret" },
				{ status: 409 },
			),
		),
	);
	const syncProjectStatus = vi.fn(async () => {});
	const setError = vi.fn();
	const { result } = renderHook(() =>
		useStudioPlanningRetry({
			projectId: "p",
			canRetryPlanning: true,
			syncProjectStatus,
			setError,
		}),
	);
	await act(async () => {
		await result.current.handleRetryPlanning();
	});
	expect(syncProjectStatus).toHaveBeenCalledTimes(1);
	expect(setError.mock.calls.every(([error]) => error === "")).toBe(true);
});

it("does not apply a retry response after switching projects", async () => {
	const request = Promise.withResolvers<Response>();
	vi.stubGlobal(
		"fetch",
		vi.fn(() => request.promise),
	);
	const syncProjectStatus = vi.fn(async () => {});
	const setError = vi.fn();
	const { result, rerender } = renderHook(
		({ projectId }) =>
			useStudioPlanningRetry({
				projectId,
				canRetryPlanning: true,
				syncProjectStatus,
				setError,
			}),
		{ initialProps: { projectId: "old" } },
	);
	let first: Promise<void>;
	act(() => {
		first = result.current.handleRetryPlanning();
	});
	rerender({ projectId: "new" });
	await act(async () => {
		request.resolve(Response.json({}, { status: 500 }));
		await first;
	});
	expect(syncProjectStatus).not.toHaveBeenCalled();
	expect(setError.mock.calls).toEqual([[""]]);
	expect(result.current.retryingPlanning).toBe(false);
});
