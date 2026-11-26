// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCodebaseSyncStatus } from "../hooks/use-codebase-sync-status";
import type { SyncStatusResponse } from "../services/sync";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
const previous: SyncStatusResponse = {
	projectId: "repo",
	sessionId: "previous",
	status: "uploaded",
	snapshotId: "old",
	analysisStatus: "ready",
	analysisId: "old-analysis",
};

test("a late recovery seed cannot attach completed progress to another pinned attempt", () => {
	const initialProps: { seed: SyncStatusResponse | null } = { seed: null };
	const { result, rerender } = renderHook(
		({ seed }: { seed: SyncStatusResponse | null }) =>
			useCodebaseSyncStatus({
				codebaseId: "repo",
				sessionId: "current",
				enabled: false,
				initialStatus: seed,
			}),
		{ initialProps },
	);
	rerender({ seed: previous });
	expect(result.current.status).toBeNull();
});

test("an initial completed seed cannot be shown under a different pinned attempt", () => {
	const { result } = renderHook(() =>
		useCodebaseSyncStatus({
			codebaseId: "repo",
			sessionId: "current",
			enabled: false,
			initialStatus: previous,
		}),
	);
	expect(result.current.status).toBeNull();
});

test("a repository switch never retains a terminal snapshot from the previous repository", () => {
	const { result, rerender } = renderHook(
		({ codebaseId }) =>
			useCodebaseSyncStatus({
				codebaseId,
				enabled: false,
				initialStatus: previous,
			}),
		{ initialProps: { codebaseId: "repo" } },
	);
	expect(result.current.status?.snapshotId).toBe("old");
	rerender({ codebaseId: "other" });
	expect(result.current.status).toBeNull();
});
