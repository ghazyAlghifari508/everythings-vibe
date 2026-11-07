// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { readOnboardingRequestId } from "../services/onboarding-request-identity";
import {
	requestCreateCodebase,
	requestRetrySession,
} from "../services/onboarding-requests";

afterEach(() => {
	vi.unstubAllGlobals();
	window.history.replaceState({}, "");
	sessionStorage.clear();
});

test("refresh retains the nonsecret attempt but a new history entry receives another identity", () => {
	window.history.replaceState({}, "");
	const first = readOnboardingRequestId();
	expect(readOnboardingRequestId()).toBe(first);
	window.history.replaceState({ ...window.history.state }, "");
	expect(readOnboardingRequestId()).toBe(first);
	window.history.pushState({}, "");
	expect(readOnboardingRequestId()).not.toBe(first);
});

test("invalid history metadata cannot become a server idempotency key", () => {
	window.history.replaceState({ codebaseStartRequest: "invalid" }, "");
	expect(readOnboardingRequestId()).toMatch(/^[0-9a-f-]{36}$/);
});

test("a lost response is unknown and a retry preserves the same operation identity", async () => {
	const bodies: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_input: string, init?: RequestInit) => {
			bodies.push(String(init?.body));
			throw new TypeError("Network dropped after commit");
		}),
	);
	const first = await requestCreateCodebase();
	expect(first).toMatchObject({ kind: "unknown" });
	await requestCreateCodebase();
	expect(new Set(bodies).size).toBe(1);
});

test("committed replay retains the repository and named session instead of reporting a new creation failure", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				id: "repo",
				name: "Repository",
				sessionId: "session",
				code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
			}),
		),
	);
	expect(await requestCreateCodebase()).toEqual({
		kind: "recovered",
		codebase: { id: "repo", name: "Repository" },
		sessionId: "session",
	});
});

test("successful malformed sync payload remains unknown and cannot silently adopt another repository's token", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				id: "repo",
				name: "Repository",
				sync: {
					projectId: "other",
					apiBaseUrl: "https://test.local",
					syncToken: "secret",
					syncCommand: "sync",
					expiresAt: new Date(Date.now() + 100000).toISOString(),
				},
			}),
		),
	);
	expect(await requestCreateCodebase()).toMatchObject({ kind: "unknown" });
});

test("expired or unavailable tokens have a recovery state, not a generic failed creation", async () => {
	for (const code of [
		"SYNC_SESSION_EXPIRED",
		"CODEBASE_SESSION_RECOVERY_REQUIRED",
		"SYNC_SESSION_ACTIVE",
		"SYNC_SNAPSHOT_UPLOADED",
	]) {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json(
					{ code, sessionId: "session", error: "Safe recovery message" },
					{ status: 409 },
				),
			),
		);
		expect(await requestRetrySession("repo")).toMatchObject({
			kind: "recovery",
			code,
			sessionId: "session",
		});
	}
});
