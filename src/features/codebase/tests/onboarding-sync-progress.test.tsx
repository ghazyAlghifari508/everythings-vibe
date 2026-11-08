// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useOnboardingSyncProgress } from "../hooks/use-onboarding-sync-progress";
import type { SyncStatusResponse } from "../services/sync";

class Source {
	static instances: Source[] = [];
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	listeners = new Map<string, (event: MessageEvent<string>) => void>();
	closed = false;
	constructor(readonly url: string) {
		Source.instances.push(this);
	}
	addEventListener(
		type: string,
		listener: (event: MessageEvent<string>) => void,
	) {
		this.listeners.set(type, listener);
	}
	close() {
		this.closed = true;
	}
	send(status: SyncStatusResponse) {
		this.listeners.get("sync")?.(
			new MessageEvent("sync", { data: JSON.stringify(status) }),
		);
	}
}
const at = (second: number) =>
	new Date(Date.UTC(2026, 10, 8, 0, 0, second)).toISOString();
const waiting: SyncStatusResponse = {
	projectId: "repo",
	sessionId: "session",
	status: "waiting_for_cli",
	updatedAt: at(0),
};
const options = {
	codebaseId: "repo",
	sessionId: "session",
	analysisProjectId: null,
	initialStatus: waiting,
};
const source = () => {
	const result = Source.instances.at(-1);
	if (!result) throw new Error("No stream opened");
	return result;
};
beforeEach(() => {
	Source.instances = [];
	vi.useFakeTimers();
	vi.stubGlobal("EventSource", Source);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json(waiting)),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

test("reconnect never exposes the older fallback or recovery snapshot", async () => {
	const { result } = renderHook(() => useOnboardingSyncProgress(options));
	await act(async () => {});
	const upload = {
		...waiting,
		status: "uploading" as const,
		updatedAt: at(10),
		uploadedCount: 9,
		manifestCount: 20,
	};
	act(() => source().send(upload));
	expect(result.current.status?.status).toBe("uploading");
	const old = source();
	act(() => old.onerror?.());
	await act(async () => {});
	expect(result.current.status).toEqual(upload);
	expect(result.current.streamNotice).not.toBeNull();
	await act(async () => vi.advanceTimersByTimeAsync(1_000));
	act(() => source().send(upload));
	expect(result.current.streamNotice).toBeNull();
	act(() => old.send({ ...waiting, status: "failed", updatedAt: at(50) }));
	expect(result.current.status).toEqual(upload);
});

test("same timestamp chunks and attempt identity cannot rewind running progress", async () => {
	const { result } = renderHook(() => useOnboardingSyncProgress(options));
	await act(async () => {});
	const upload = {
		...waiting,
		status: "uploading" as const,
		updatedAt: at(10),
		uploadedCount: 9,
		manifestCount: 20,
	};
	act(() => source().send(upload));
	act(() => source().send({ ...upload, uploadedCount: 4 }));
	expect(result.current.status?.uploadedCount).toBe(9);
	const retry = {
		...upload,
		status: "uploaded" as const,
		snapshotId: "snapshot",
		analysisAttemptId: "new",
		analysisAttemptCreatedAt: at(20),
		analysisAttemptUpdatedAt: at(20),
		analysisAttemptStatus: "pending" as const,
	};
	act(() => source().send(retry));
	act(() =>
		source().send({
			...retry,
			analysisAttemptId: "old",
			analysisAttemptCreatedAt: at(5),
			analysisAttemptUpdatedAt: at(30),
			analysisAttemptStatus: "failed",
		}),
	);
	expect(result.current.status?.analysisAttemptId).toBe("new");
	expect(result.current.status?.analysisAttemptStatus).toBe("pending");
});

test("session replacement drops all old frames and restores the new session on refresh", async () => {
	const { result, rerender, unmount } = renderHook(useOnboardingSyncProgress, {
		initialProps: options,
	});
	await act(async () => {});
	const old = source();
	act(() => old.send({ ...waiting, status: "uploaded", snapshotId: "old" }));
	const fresh = { ...waiting, sessionId: "replacement" };
	rerender({ ...options, sessionId: "replacement", initialStatus: fresh });
	act(() => old.send({ ...waiting, status: "ready", updatedAt: at(40) }));
	expect(result.current.status).toEqual(fresh);
	unmount();
	const completed = {
		...fresh,
		status: "uploaded" as const,
		snapshotId: "fresh",
		updatedAt: at(10),
	};
	const restored = renderHook(() =>
		useOnboardingSyncProgress({
			...options,
			sessionId: "replacement",
			initialStatus: completed,
		}),
	);
	expect(restored.result.current.status).toEqual(completed);
});

test("repeated opens without valid frames exhaust reconnects and keep the last truth", async () => {
	const { result } = renderHook(() => useOnboardingSyncProgress(options));
	await act(async () => {});
	for (let attempt = 0; attempt < 4; attempt++) {
		act(() => {
			source().onopen?.();
			source().onerror?.();
		});
		await act(async () => vi.advanceTimersByTimeAsync(5_000));
	}
	expect(Source.instances).toHaveLength(4);
	expect(result.current.status).toEqual(waiting);
	expect(result.current.error).toBeNull();
});
