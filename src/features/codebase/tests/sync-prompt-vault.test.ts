// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import type { SyncPromptPayload } from "../services/sync";
import {
	clearSyncPromptVault,
	forgetSyncPrompt,
	readSyncPrompt,
	rememberSyncPrompt,
} from "../services/sync-prompt-vault";

function payload(
	sessionId: string,
	overrides: Partial<SyncPromptPayload> = {},
): SyncPromptPayload {
	return {
		projectId: "repo",
		sessionId,
		apiBaseUrl: "https://test.local",
		syncToken: `token-${sessionId}`,
		syncCommand: "sync",
		cliMinVersion: "2.0.0",
		expiresAt: new Date(Date.now() + 60_000).toISOString(),
		...overrides,
	};
}

afterEach(() => {
	clearSyncPromptVault();
	vi.unstubAllGlobals();
});

test("hands back the same prompt for the same codebase and session", () => {
	const held = payload("session-a");
	expect(rememberSyncPrompt(held)).toBe(true);
	expect(readSyncPrompt("repo", "session-a")).toEqual(held);
	// No browser storage involved: the raw token lives in memory only.
	expect(JSON.stringify(sessionStorage)).not.toContain(held.syncToken);
	expect(JSON.stringify(localStorage)).not.toContain(held.syncToken);
});

test("a different session for the same codebase drops the superseded credential", () => {
	rememberSyncPrompt(payload("session-a"));
	expect(readSyncPrompt("repo", "session-b")).toBeNull();
	// The mismatch deleted the entry rather than leaving a stale token behind.
	expect(readSyncPrompt("repo", "session-a")).toBeNull();
});

test("a replacement prompt overwrites the previous credential for that codebase", () => {
	rememberSyncPrompt(payload("session-a"));
	const replacement = payload("session-b");
	rememberSyncPrompt(replacement);
	expect(readSyncPrompt("repo", "session-b")).toEqual(replacement);
	expect(readSyncPrompt("repo", "session-a")).toBeNull();
});

test("refuses to retain or return an expired credential", () => {
	const expired = payload("session-a", {
		expiresAt: new Date(Date.now() - 1_000).toISOString(),
	});
	expect(rememberSyncPrompt(expired)).toBe(false);
	expect(readSyncPrompt("repo", "session-a")).toBeNull();

	const valid = payload("session-b");
	rememberSyncPrompt(valid);
	expect(
		readSyncPrompt("repo", "session-b", Date.parse(valid.expiresAt) + 1),
	).toBeNull();
});

test("forget and clear remove retained credentials", () => {
	rememberSyncPrompt(payload("session-a"));
	forgetSyncPrompt("repo");
	expect(readSyncPrompt("repo", "session-a")).toBeNull();

	rememberSyncPrompt(payload("session-b"));
	clearSyncPromptVault();
	expect(readSyncPrompt("repo", "session-b")).toBeNull();
});

test("server-rendered execution never retains a credential in module memory", () => {
	vi.stubGlobal("window", undefined);
	expect(rememberSyncPrompt(payload("session-a"))).toBe(false);
	expect(readSyncPrompt("repo", "session-a")).toBeNull();
});
