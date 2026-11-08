// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ScreenConnectPromptStep } from "../components/workspace/screen-connect-prompt-step";
import type { SyncStatusResponse } from "../services/sync";

afterEach(cleanup);

const PAYLOAD = {
	projectId: "repo",
	sessionId: "session",
	apiBaseUrl: "https://test.local",
	syncToken: "secret",
	syncCommand: "sync",
	cliMinVersion: "2.0.0",
	expiresAt: new Date(Date.now() + 60000).toISOString(),
};

function status(overrides: Partial<SyncStatusResponse> = {}) {
	return {
		projectId: "repo",
		sessionId: "session",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	} satisfies SyncStatusResponse;
}

test("an active upload without a browser token never offers a replacement credential", () => {
	render(
		<ScreenConnectPromptStep
			projectName="Repository"
			payload={null}
			isStarting={false}
			status={status({
				status: "uploading",
				expiresAt: new Date(0).toISOString(),
			})}
			onRequestNewToken={() => {
				throw new Error("must not renew");
			}}
		/>,
	);
	// No replacement action, and no status sentence standing in for the prompt:
	// the progress section is the only place that reports sync progress.
	expect(screen.queryByRole("button")).toBeNull();
	expect(
		screen.queryByText("Agent sedang menyinkronkan repository."),
	).toBeNull();
	expect(screen.getByTestId("prompt-box").textContent).toContain(
		"Prompt ini hanya tersedia sekali",
	);
});

test("a completed upload keeps the prompt it was handed and never swaps in a status message", () => {
	render(
		<ScreenConnectPromptStep
			projectName="Repository"
			isStarting={false}
			payload={PAYLOAD}
			status={status({ status: "uploaded", snapshotId: "snapshot-1" })}
			onRequestNewToken={() => {
				throw new Error("must not renew");
			}}
		/>,
	);
	// The credential is still valid in this browser, so the box keeps showing it
	// — with its copy action — instead of a success message.
	expect(screen.getByTestId("prompt-box").textContent).toContain("secret");
	expect(
		screen.getByRole("button", { name: "Salin prompt untuk AI agent" }),
	).toBeDefined();
	expect(screen.queryByText("Source code berhasil diterima.")).toBeNull();
	expect(screen.queryByTestId("prompt-transport-done")).toBeNull();
	// 15: the credential is rendered from memory only — nothing is persisted.
	expect(window.localStorage.length).toBe(0);
	expect(window.sessionStorage.length).toBe(0);
});

test("a live prompt is never replaced by a billing lock", () => {
	render(
		<ScreenConnectPromptStep
			projectName="Repository"
			isStarting={false}
			payload={PAYLOAD}
			status={status({ status: "uploading" })}
			lockedPrompt={{
				variant: "insufficient",
				title: "Blocked",
				description: "Credits",
			}}
			onRequestNewToken={() => {
				throw new Error("must not renew");
			}}
		/>,
	);
	expect(screen.getByTestId("prompt-box").textContent).toContain("secret");
	expect(screen.queryByTestId("locked-prompt-region")).toBeNull();
	expect(screen.queryByText("Blocked")).toBeNull();
});

test("a stored upload without a credential offers no replacement action", () => {
	render(
		<ScreenConnectPromptStep
			projectName="Repository"
			payload={null}
			isStarting={false}
			status={status({ status: "uploaded", snapshotId: "snapshot-1" })}
			onRequestNewToken={() => {
				throw new Error("must not renew");
			}}
		/>,
	);
	expect(screen.queryByRole("button")).toBeNull();
	expect(screen.queryByText("Source code berhasil diterima.")).toBeNull();
});

test("an expired credential is replaced by the renewal state, never by success copy", () => {
	render(
		<ScreenConnectPromptStep
			projectName="Repository"
			isStarting={false}
			payload={{ ...PAYLOAD, expiresAt: new Date(0).toISOString() }}
			status={status({ status: "waiting_for_cli" })}
			onRequestNewToken={() => {}}
		/>,
	);
	expect(screen.queryByText("secret")).toBeNull();
	expect(screen.getByText("Sesi sinkronisasi berakhir")).toBeDefined();
	expect(
		screen.getByRole("button", { name: "Buat prompt baru" }),
	).toBeDefined();
});
