// Real-PostgreSQL coverage for the CLI attempt announcement
// (`/api/v1/codebases/$id/codebase/connect`), the persisted connecting phase it
// produces, and the handshake that ends it.
//
// The contract under test is the one the browser depends on:
// - an announcement is recorded as a lifecycle event and does NOT connect the
//   session (the status stays `waiting_for_cli`, no handshake evidence);
// - the announcement binds the attempt's snapshot, so a CLI that dies before its
//   handshake can still report that failure and the browser is not left on a
//   connecting row;
// - the handshake still owns `connected`, and a late announcement cannot repaint
//   a session that already moved on;
// - the credential/ownership/version rules are the handshake's, unchanged.
import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { resolveSyncStageView } from "../services/sync";
import "./analysis-credit-db-fixture";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

const CODEBASE_SYNC_URL = (codebaseId: string, suffix: string) =>
	`https://example.test/api/v1/codebases/${codebaseId}/codebase/${suffix}`;

function terminalRequest(input: {
	codebaseId: string;
	suffix: string;
	token: string;
	body: unknown;
}): Request {
	return new Request(CODEBASE_SYNC_URL(input.codebaseId, input.suffix), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${input.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(input.body),
	});
}

/** One user, one repository, one waiting session with a known credential. */
async function seedWaitingAttempt() {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { hashSyncToken } = await import("../services/sync.server");

	auth.userId = crypto.randomUUID();
	const codebaseId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();
	const token = `token-${crypto.randomUUID()}`;
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@test.local`,
		name: "Connect",
		billingExempt: true,
	});
	await db.insert(s.subscriptions).values({
		id: crypto.randomUUID(),
		userId: auth.userId,
		plan: "pro",
		credits: 100,
	});
	await db.insert(s.codebases).values({
		id: codebaseId,
		userId: auth.userId,
		name: "Repository",
	});
	await db.insert(s.codebaseSyncSessions).values({
		id: sessionId,
		codebaseId,
		userId: auth.userId,
		credentialHash: hashSyncToken(token),
		status: "waiting_for_cli",
		expiresAt: new Date(Date.now() + 30 * 60 * 1000),
	});
	return { codebaseId, sessionId, token };
}

async function readSnapshot(codebaseId: string, sessionId: string) {
	const { readSyncStatusSnapshot } = await import(
		"../services/sync-status-snapshot.server"
	);
	const result = await readSyncStatusSnapshot({
		userId: auth.userId,
		codebaseId,
		sessionId,
		projectId: null,
	});
	if (!result.ok) throw new Error(`status read failed: ${result.status}`);
	return result.snapshot;
}

test("an announcement records a real connecting phase without connecting the session", async () => {
	const { handleCodebaseSyncConnect } = await import(
		"../services/sync-connect-route.server"
	);
	const { handleCodebaseSyncHandshake } = await import(
		"../services/sync-handshake-route.server"
	);
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { codebaseId, sessionId, token } = await seedWaitingAttempt();

	const announce = () =>
		handleCodebaseSyncConnect({
			params: { id: codebaseId },
			request: terminalRequest({
				codebaseId,
				suffix: "connect",
				token,
				body: { cliVersion: "3.2.1" },
			}),
		});

	const first = await announce();
	expect(first.status).toBe(200);
	// One session is one attempt, so the CLI may report a failure against it.
	expect(await first.json()).toMatchObject({
		sessionId,
		attemptId: sessionId,
		status: "waiting_for_cli",
	});

	const announced = await readSnapshot(codebaseId, sessionId);
	// The status is untouched: only the handshake may commit a connection.
	expect(announced.status).toBe("waiting_for_cli");
	expect(announced.cliConnectedAt).toBeUndefined();
	expect(announced.snapshotId).toBeNull();
	// The connecting phase is a persisted event, not a browser guess.
	expect(announced.lifecycle?.map((event) => event.kind)).toEqual([
		"cli_connecting",
	]);
	const view = resolveSyncStageView(announced);
	expect(view.stages.map((row) => row.state)).toEqual([
		"active",
		"waiting",
		"waiting",
	]);
	expect(view.hasStarted).toBe(true);
	expect(view.canRetry).toBe(false);

	// The announcement binds the attempt's snapshot, which is what lets a CLI
	// that dies before its handshake report the failure instead of leaving the
	// browser on a connecting row forever.
	const [boundSnapshot] = await db
		.select({ status: s.codebaseSnapshots.status })
		.from(s.codebaseSnapshots)
		.where(eq(s.codebaseSnapshots.syncSessionId, sessionId));
	expect(boundSnapshot?.status).toBe("uploading");

	// A duplicate announcement is idempotent: one event, one timestamp.
	await announce();
	const duplicated = await readSnapshot(codebaseId, sessionId);
	expect(duplicated.lifecycle).toEqual(announced.lifecycle);

	// The handshake commits the connection and ends the connecting phase.
	const handshake = await handleCodebaseSyncHandshake({
		params: { id: codebaseId },
		request: terminalRequest({
			codebaseId,
			suffix: "sync",
			token,
			body: { cliVersion: "3.2.1" },
		}),
	});
	expect(handshake.status).toBe(200);
	const connected = await readSnapshot(codebaseId, sessionId);
	expect(connected.status).toBe("connected");
	expect(connected.cliConnectedAt).toBeTruthy();
	expect(connected.lifecycle?.map((event) => event.kind)).toEqual([
		"cli_connecting",
		"agent_connected",
	]);
	expect(
		resolveSyncStageView(connected).stages.map((row) => row.state),
	).toEqual(["done", "active", "waiting"]);

	// A late announcement (a duplicated request racing the handshake) cannot
	// repaint a session the server already moved on from.
	await announce();
	const late = await readSnapshot(codebaseId, sessionId);
	expect(late.status).toBe("connected");
	expect(late.lifecycle).toEqual(connected.lifecycle);
});

test("a CLI that fails after announcing can end the connecting phase", async () => {
	const { handleCodebaseSyncConnect } = await import(
		"../services/sync-connect-route.server"
	);
	const { handleSyncFailureReport } = await import(
		"../services/sync-upload-failure-route.server"
	);
	const { codebaseId, sessionId, token } = await seedWaitingAttempt();

	const announce = await handleCodebaseSyncConnect({
		params: { id: codebaseId },
		request: terminalRequest({
			codebaseId,
			suffix: "connect",
			token,
			body: { cliVersion: "3.2.1" },
		}),
	});
	expect(announce.status).toBe(200);

	// Root resolution failed before the handshake: the CLI reports it against the
	// attempt the announcement bound.
	const reported = await handleSyncFailureReport(
		terminalRequest({
			codebaseId,
			suffix: "failure",
			token,
			body: {
				sessionId,
				attemptId: sessionId,
				errorCode: "ROOT_RESOLUTION_FAILED",
				idempotencyKey: `${sessionId}:failure:0`,
			},
		}),
		{ id: codebaseId },
	);
	expect(reported.status).toBe(200);
	expect(await reported.json()).toMatchObject({ status: "failed" });

	const failed = await readSnapshot(codebaseId, sessionId);
	expect(failed.status).toBe("failed");
	// The terminal status stops the spinner: the stage list is withheld and the
	// user is offered the retry instead.
	const view = resolveSyncStageView(failed);
	expect(view.failed).toBe(true);
	expect(view.stages).toEqual([]);
	expect(view.canRetry).toBe(true);
});

test("the announcement is bound to the credential's own codebase and version", async () => {
	const { handleCodebaseSyncConnect } = await import(
		"../services/sync-connect-route.server"
	);
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { hashSyncToken } = await import("../services/sync.server");
	const { codebaseId, sessionId, token } = await seedWaitingAttempt();

	const announce = (body: unknown, requestToken: string, id = codebaseId) =>
		handleCodebaseSyncConnect({
			params: { id },
			request: terminalRequest({
				codebaseId: id,
				suffix: "connect",
				token: requestToken,
				body,
			}),
		});

	// An unknown credential never reaches the session.
	const unknown = await announce({ cliVersion: "3.2.1" }, "not-a-token");
	expect(unknown.status).toBe(401);

	// A codebase the credential was not issued for is rejected uniformly.
	const other = crypto.randomUUID();
	await db.insert(s.codebases).values({
		id: other,
		userId: auth.userId,
		name: "Other",
	});
	const foreign = await announce({ cliVersion: "3.2.1" }, token, other);
	expect(foreign.status).toBe(401);

	// Fail closed on an unsupported version, before any state changes.
	const outdated = await announce({ cliVersion: "1.0.0" }, token);
	expect(outdated.status).toBe(426);
	const untouched = await readSnapshot(codebaseId, sessionId);
	expect(untouched.lifecycle).toEqual([]);

	// A body without a version is rejected too.
	const malformed = await announce({}, token);
	expect(malformed.status).toBe(400);

	// The accepted announcement is recorded exactly once.
	expect((await announce({ cliVersion: "3.2.1" }, token)).status).toBe(200);
	const recorded = await readSnapshot(codebaseId, sessionId);
	expect(recorded.lifecycle?.map((event) => event.kind)).toEqual([
		"cli_connecting",
	]);
	expect(hashSyncToken(token)).toBeTruthy();
});

test("a terminal session is refused by the announcement boundary", async () => {
	const { handleCodebaseSyncConnect } = await import(
		"../services/sync-connect-route.server"
	);
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { hashSyncToken } = await import("../services/sync.server");
	const { codebaseId, token } = await seedWaitingAttempt();

	const expiredId = crypto.randomUUID();
	await db.insert(s.codebaseSyncSessions).values({
		id: expiredId,
		codebaseId,
		userId: auth.userId,
		credentialHash: hashSyncToken(`${token}-expired`),
		status: "waiting_for_cli",
		expiresAt: new Date(Date.now() - 1000),
	});

	const response = await handleCodebaseSyncConnect({
		params: { id: codebaseId },
		request: terminalRequest({
			codebaseId,
			suffix: "connect",
			token: `${token}-expired`,
			body: { cliVersion: "3.2.1" },
		}),
	});
	expect(response.status).toBe(410);
	const [row] = await db
		.select({ status: s.codebaseSyncSessions.status })
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.id, expiredId));
	expect(row?.status).toBe("expired");
});
