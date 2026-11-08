// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ScreenConnect } from "../components/workspace/screen-connect";
import { SyncStageList } from "../components/workspace/sync-stage-list";
import { StageRow } from "../components/workspace/sync-stage-row";
import type { SyncPromptPayload, SyncStatusResponse } from "../services/sync";

const status: SyncStatusResponse = {
	projectId: "repo",
	sessionId: "session",
	status: "waiting_for_cli",
};
const payload: SyncPromptPayload = {
	projectId: "repo",
	sessionId: "session",
	apiBaseUrl: "https://example.com",
	syncToken: "secret-local-only",
	syncCommand: "sync",
	cliMinVersion: "2.0.0",
	expiresAt: "2099-01-01T00:00:00.000Z",
};
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

test("valid session immediately shows waiting spinner and all pending stages before a status frame", () => {
	const { container } = render(
		<ScreenConnect projectName="Repository" payload={payload} status={null} />,
	);
	expect(
		container.querySelector(
			'[data-testid="sync-stage-agent"] [data-testid="spinner"]',
		),
	).not.toBeNull();
	expect(
		[...container.querySelectorAll("[data-stage-state]")].map((row) =>
			row.getAttribute("data-stage-state"),
		),
	).toEqual(["active", "waiting", "waiting", "waiting"]);
	expect(container.querySelector('[role="timer"]')).toBeNull();
});

test("no session or unresolved eligibility cannot claim waiting activity", () => {
	const { container } = render(
		<ScreenConnect projectName="Repository" payload={null} status={null} />,
	);
	expect(container.querySelector("[data-stage-state]")).toBeNull();
	expect(container.querySelector('[data-testid="spinner"]')).toBeNull();
});

test("elapsed timer stops on completion even if a retained start timestamp exists", () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-08T00:00:10.000Z"));
	const row = { title: "Upload", startedAt: "2026-11-08T00:00:00.000Z" };
	const { rerender, container } = render(
		<StageRow testId="stage" row={{ ...row, state: "active" }} />,
	);
	expect(container.querySelector('[role="timer"]')?.textContent).toBe("10.0s");
	rerender(<StageRow testId="stage" row={{ ...row, state: "done" }} />);
	expect(vi.getTimerCount()).toBe(0);
	expect(container.querySelector('[role="timer"]')).toBeNull();
});

test("an explicit retry does not reuse the failed attempt's elapsed start", () => {
	const { container } = render(
		<SyncStageList
			status={{
				...status,
				status: "uploaded",
				snapshotId: "snapshot",
				analysisAttemptStatus: "failed",
				analysisAttemptCreatedAt: "2026-11-07T00:00:00.000Z",
			}}
			isRetrying
		/>,
	);
	expect(
		container
			.querySelector('[data-testid="sync-stage-analysis"]')
			?.getAttribute("data-stage-state"),
	).toBe("active");
	expect(container.querySelector('[role="timer"]')).toBeNull();
});

test("usable analysis survives stale failure presentation and completion ends motion", () => {
	const retry = vi.fn();
	const { container } = render(
		<SyncStageList
			status={{
				...status,
				status: "uploaded",
				snapshotId: "snapshot",
				analysisStatus: "ready",
				analysisAttemptStatus: "failed",
			}}
			isAnalysisReady
			showAnalysisFailure
			onRetryAnalysis={retry}
		/>,
	);
	expect(
		container
			.querySelector('[data-testid="sync-stage-analysis"]')
			?.getAttribute("data-stage-state"),
	).toBe("done");
	expect(
		container.querySelector('[data-testid="retry-analysis-button"]'),
	).toBeNull();
	expect(container.querySelector('[data-testid="spinner"]')).toBeNull();
});

test("completed fast stages keep real chronology without scheduling a replay", () => {
	vi.useFakeTimers();
	const { container } = render(
		<SyncStageList
			status={{
				...status,
				status: "uploaded",
				snapshotId: "snapshot",
				lifecycle: [
					{ kind: "agent_connected", at: "2026-11-08T00:00:01.000Z" },
					{ kind: "upload_started", at: "2026-11-08T00:00:02.000Z" },
					{ kind: "snapshot_persisted", at: "2026-11-08T00:00:03.000Z" },
				],
			}}
		/>,
	);
	expect(
		[...container.querySelectorAll("time")].map((time) => time.dateTime),
	).toEqual([
		"2026-11-08T00:00:01.000Z",
		"2026-11-08T00:00:02.000Z",
		"2026-11-08T00:00:03.000Z",
	]);
	expect(vi.getTimerCount()).toBe(0);
	act(() => vi.advanceTimersByTime(60_000));
	expect(container.querySelector('[data-testid="spinner"]')).toBeNull();
});
