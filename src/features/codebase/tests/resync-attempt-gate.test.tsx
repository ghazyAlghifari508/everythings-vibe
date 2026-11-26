// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CodebaseResyncModal } from "../components/planning/codebase-resync-modal";
import type { SyncPromptPayload, SyncStatusResponse } from "../services/sync";

afterEach(cleanup);
const payload: SyncPromptPayload = {
	projectId: "repo",
	sessionId: "attempt",
	syncToken: "secret-only-for-waiting",
	apiBaseUrl: "https://test.local",
	syncCommand: "everythings-vibe codebase sync",
	cliMinVersion: "2.0.0",
	expiresAt: new Date(Date.now() + 600000).toISOString(),
};
const complete: SyncStatusResponse = {
	projectId: "repo",
	sessionId: "attempt",
	status: "uploaded",
	snapshotId: "snapshot",
	analysisStatus: "ready",
	analysisId: "analysis",
};

test("unbound completed status never enables the current attempt action", () => {
	render(
		<CodebaseResyncModal
			isOpen
			onClose={() => {}}
			projectName="Repository"
			payload={null}
			status={complete}
		/>,
	);
	expect(
		screen.getByTestId<HTMLButtonElement>("resync-complete-button").disabled,
	).toBe(true);
});

test("preparation and session errors suppress completion even when old matching status is still supplied", () => {
	const { rerender } = render(
		<CodebaseResyncModal
			isOpen
			onClose={() => {}}
			projectName="Repository"
			payload={payload}
			status={complete}
			isStarting
		/>,
	);
	expect(
		screen.getByTestId<HTMLButtonElement>("resync-complete-button").disabled,
	).toBe(true);
	rerender(
		<CodebaseResyncModal
			isOpen
			onClose={() => {}}
			projectName="Repository"
			payload={null}
			activeSessionId="attempt"
			status={complete}
			sessionError="Session unavailable"
		/>,
	);
	expect(
		screen.getByTestId<HTMLButtonElement>("resync-complete-button").disabled,
	).toBe(true);
});

test("completed transport stops offering a spent prompt while waiting for its analysis", () => {
	render(
		<CodebaseResyncModal
			isOpen
			onClose={() => {}}
			projectName="Repository"
			payload={payload}
			status={{ ...complete, analysisId: null, analysisStatus: undefined }}
		/>,
	);
	expect(
		screen.queryByRole("button", { name: "Salin instruksi sync ulang" }),
	).toBeNull();
	expect(
		screen.getByTestId<HTMLButtonElement>("resync-complete-button").disabled,
	).toBe(true);
});
