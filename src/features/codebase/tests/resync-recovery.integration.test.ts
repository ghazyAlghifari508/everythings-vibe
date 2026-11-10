import { and, eq, sql } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";
import { CODEBASE_SYNC_SESSION_EXPIRY_MS } from "../types/codebase-constants";
import { auth, request, seed } from "./resync-db-fixture";

// Dynamic service imports must follow the fixture's isolated DATABASE_URL setup.

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function sessions(f: Awaited<ReturnType<typeof seed>>) {
	return f.db
		.select()
		.from(f.s.codebaseSyncSessions)
		.where(
			and(
				eq(f.s.codebaseSyncSessions.codebaseId, f.codebaseId),
				eq(f.s.codebaseSyncSessions.userId, f.userId),
			),
		);
}

test("retry requires the exact session identity before any credential can be replaced", async () => {
	const f = await seed();
	const before = await sessions(f);
	const response = await request(f.codebaseId, { action: "retry" });
	expect(response.status).toBe(400);
	expect(await sessions(f)).toEqual(before);
});

test("an expired unused attempt is reported expired and admits one fresh resync", async () => {
	const f = await seed();
	const requestId = crypto.randomUUID();
	const accepted = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now() + CODEBASE_SYNC_SESSION_EXPIRY_MS + 1);
	const replay = await request(f.codebaseId, { action: "resync", requestId });
	expect(replay.status).toBe(200);
	expect(await replay.json()).toMatchObject({
		sessionId: accepted.sessionId,
		status: "expired",
	});
	const responses = await Promise.all(
		Array.from({ length: 3 }, () =>
			request(f.codebaseId, {
				action: "resync",
				requestId: crypto.randomUUID(),
			}),
		),
	);
	const payloads = await Promise.all(
		responses.map((response) => response.json()),
	);
	expect(new Set(payloads.map((payload) => payload.sessionId)).size).toBe(1);
	expect(payloads[0].sessionId).not.toBe(accepted.sessionId);
	expect(payloads.filter((payload) => payload.syncToken)).toHaveLength(1);
	expect(
		(await sessions(f)).find((session) => session.id === accepted.sessionId)
			?.status,
	).toBe("expired");
});

test("active recovery never rotates the CLI credential; a reported failure permits retry", async () => {
	const f = await seed();
	const requestId = crypto.randomUUID();
	const accepted = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	const { handleCodebaseSyncHandshake } = await import(
		"../services/sync-handshake-route.server"
	);
	const handshake = () =>
		handleCodebaseSyncHandshake({
			params: { id: f.codebaseId },
			request: new Request("https://test.local/sync", {
				method: "POST",
				headers: { Authorization: `Bearer ${accepted.syncToken}` },
				body: JSON.stringify({ cliVersion: "3.2.1" }),
			}),
		});
	const connected = await handshake();
	expect(connected.status).toBe(200);
	const binding = await connected.json();
	const before = await sessions(f);
	const recovered = await request(f.codebaseId, { action: "recover" });
	expect(recovered.status).toBe(409);
	expect(await recovered.json()).toMatchObject({
		code: "SYNC_SESSION_ACTIVE",
		sessionId: accepted.sessionId,
		status: "connected",
	});
	const otherTab = await request(f.codebaseId, {
		action: "resync",
		requestId: crypto.randomUUID(),
	});
	expect(await otherTab.json()).toMatchObject({
		sessionId: accepted.sessionId,
		status: "connected",
	});
	expect(await sessions(f)).toEqual(before);
	const { handleSyncFailureReport } = await import(
		"../services/sync-upload-failure-route.server"
	);
	const failed = await handleSyncFailureReport(
		new Request("https://test.local/failure", {
			method: "POST",
			headers: { Authorization: `Bearer ${accepted.syncToken}` },
			body: JSON.stringify({
				sessionId: binding.sessionId,
				attemptId: binding.attemptId,
				idempotencyKey: `${binding.attemptId}:failure:0`,
				errorCode: "SYNC_FAILED",
			}),
		}),
		{ id: f.codebaseId },
	);
	expect(failed.status).toBe(200);
	const replaced = await request(f.codebaseId, {
		action: "retry",
		sessionId: accepted.sessionId,
	});
	expect(replaced.status).toBe(200);
	const next = await replaced.json();
	expect(next.sessionId).not.toBe(accepted.sessionId);
	expect(next.syncToken).not.toBe(accepted.syncToken);
	expect(
		(
			await (
				await request(f.codebaseId, { action: "resync", requestId })
			).json()
		).sessionId,
	).toBe(next.sessionId);
	expect((await handshake()).status).toBe(401);
});

test("database failures remain HTTP 503 with safe nested SQLSTATE diagnostics and no partial attempt", async () => {
	const f = await seed();
	const before = await sessions(f);
	const secret = "fixture-private-token-do-not-log";
	let failure: unknown;
	try {
		await f.db.execute(
			sql`select id from missing_resync_request_fixture where id = ${secret}`,
		);
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(Error);
	const creditPreflight = await import(
		"../services/analysis-credit-preflight.server"
	);
	const preflight = await creditPreflight.checkPreSyncCredit(f.userId);
	vi.spyOn(creditPreflight, "checkPreSyncCredit").mockResolvedValueOnce(
		preflight,
	);
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(f.db, "transaction").mockRejectedValueOnce(failure);
	const requestId = crypto.randomUUID();
	const response = await request(f.codebaseId, { action: "resync", requestId });
	expect(response.status).toBe(503);
	const body = await response.json();
	expect(body.code).toBe("CODEBASE_SESSION_REPLACEMENT_FAILED");
	const record = log.mock.calls.find(
		([label]) => label === "[codebase/session] preparation failed",
	)?.[1];
	expect(record).toMatchObject({
		databaseErrorCode: "42P01",
		codebaseId: f.codebaseId,
		requestId,
		action: "resync",
	});
	for (const serialized of [
		JSON.stringify(body),
		JSON.stringify(log.mock.calls),
	]) {
		expect(serialized).not.toContain(secret);
		expect(serialized).not.toContain("select id");
		expect(serialized).not.toContain("credentialHash");
	}
	expect(await sessions(f)).toEqual(before);
	const retry = await request(f.codebaseId, { action: "resync", requestId });
	expect(retry.status).toBe(200);
	expect((await retry.json()).syncToken).toBeTypeOf("string");
});
