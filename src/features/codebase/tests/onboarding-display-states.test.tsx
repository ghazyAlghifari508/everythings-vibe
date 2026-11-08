// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ScreenConnect } from "../components/workspace/screen-connect";
import type { SyncPromptPayload, SyncStatusResponse } from "../services/sync";

const payload: SyncPromptPayload = {
	projectId: "repo",
	sessionId: "session",
	apiBaseUrl: "https://test.local",
	syncToken: "token",
	cliMinVersion: "2.0.0",
	syncCommand: "sync",
	expiresAt: new Date(Date.now() + 600_000).toISOString(),
};
const base: SyncStatusResponse = {
	projectId: "repo",
	sessionId: "session",
	status: "waiting_for_cli",
	snapshotId: null,
};
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function renderState(overrides: {
	payload?: SyncPromptPayload | null;
	status: SyncStatusResponse;
	analysisError?: string | null;
	retry?: () => void;
	ready?: boolean;
}) {
	return render(
		<ScreenConnect
			projectName="Repository"
			payload={overrides.payload === undefined ? payload : overrides.payload}
			status={overrides.status}
			isStarting={false}
			analysisError={overrides.analysisError ?? null}
			onRetryAnalysis={overrides.retry}
			canContinueToSummary={overrides.ready}
			onContinueToSummary={overrides.ready ? () => {} : undefined}
			onRequestNewToken={() => {}}
		/>,
	);
}

test("A waiting for CLI is the only claim, with no analysis or new session offer", () => {
	const { container } = renderState({ status: base });
	expect(container.textContent).toContain("Menunggu agent");
	expect(container.textContent).not.toContain("Menganalisis repository");
	expect(container.textContent).not.toContain("Buat sesi baru");
	expect(container.textContent).not.toContain("Analisis belum berhasil");
	// The wait for the user is passive: no spinner and no elapsed timer.
	expect(container.querySelectorAll('[data-testid="spinner"]')).toHaveLength(0);
	expect(container.querySelector("[role='timer']")).toBeNull();
});

test("B CLI syncing shows the upload without claiming an analysis started", () => {
	const { container } = renderState({
		payload: null,
		status: {
			...base,
			status: "uploading",
			cliConnectedAt: "2026-01-01T00:00:00.000Z",
		},
	});
	expect(container.textContent).toContain("Mengunggah repository...");
	expect(container.textContent).not.toContain("Menganalisis repository");
	expect(container.textContent).not.toContain("Buat sesi baru");
});

test("C uploaded with a running analysis never mixes in a new session offer", () => {
	const { container } = renderState({
		payload: null,
		status: {
			...base,
			status: "uploaded",
			snapshotId: "snapshot",
			analysisAttemptId: "attempt",
			analysisAttemptStatus: "pending",
		},
	});
	expect(container.textContent).toContain("Sinkronisasi selesai");
	expect(container.textContent).toContain("Menganalisis repository...");
	expect(container.textContent).not.toContain("Buat sesi baru");
});

test("D failed analysis offers analysis retry and no re-sync", () => {
	const retry = vi.fn();
	const { container, getByTestId } = renderState({
		payload: null,
		status: {
			...base,
			status: "uploaded",
			snapshotId: "snapshot",
			analysisAttemptId: "attempt",
			analysisAttemptStatus: "failed",
		},
		analysisError: "Analisis gagal",
		retry,
	});
	expect(container.textContent).toContain("Sinkronisasi selesai");
	expect(container.textContent).toContain("Analisis belum berhasil");
	expect(container.textContent).not.toContain("Buat sesi baru");
	getByTestId("retry-analysis-button").click();
	expect(retry).toHaveBeenCalledOnce();
});

test("E expired before upload offers a new session and no analysis progress", () => {
	const { container } = renderState({
		payload: {
			...payload,
			expiresAt: new Date(Date.now() - 60_000).toISOString(),
		},
		status: {
			...base,
			status: "expired",
			expiresAt: new Date(Date.now() - 60_000).toISOString(),
		},
	});
	expect(container.textContent).toContain("Buat prompt baru");
	expect(container.textContent).not.toContain("Menganalisis repository");
	expect(container.textContent).not.toContain("Analisis belum berhasil");
});

test("F ready unlocks the workspace action", () => {
	const { container, getByTestId } = renderState({
		payload: null,
		status: {
			...base,
			status: "uploaded",
			snapshotId: "snapshot",
			analysisStatus: "ready",
			analysisAttemptStatus: "ready",
		},
		ready: true,
	});
	expect(container.textContent).toContain("Analisis selesai");
	expect(
		(getByTestId("sync-continue-to-summary") as HTMLButtonElement).disabled,
	).toBe(false);
});
