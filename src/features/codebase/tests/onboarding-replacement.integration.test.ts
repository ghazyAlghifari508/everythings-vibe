// Secure prompt recovery / replacement lifecycle against a real PostgreSQL
// schema. Proves the FINAL CONTRACT: recovering an unfinished repository
// replaces a credential under the SAME codebase — never a new repository — and
// never rotates a credential an agent may be using.
import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

import { hashSyncToken } from "../services/sync.server";

test("prompt replacement keeps one repository, invalidates only the named waiting credential, and refuses live or uploaded attempts", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { handleCodebaseCreate, handleCodebaseList } = await import(
		"../services/library-route.server"
	);
	const { handleCodebaseSessionCreate, handleCodebaseSessionRead } =
		await import("../services/sync-session-route.server");

	auth.userId = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@example.test`,
		name: "Recovery",
		initialAnalysisUsedAt: new Date(),
	});
	await db.insert(s.subscriptions).values({
		id: crypto.randomUUID(),
		userId: auth.userId,
		plan: "pro",
		credits: 100,
	});

	const sessionRequest = (codebaseId: string, body: object) =>
		handleCodebaseSessionCreate({
			params: { codebaseId },
			request: new Request(
				`https://example.test/api/codebases/${codebaseId}/session`,
				{ method: "POST", body: JSON.stringify(body) },
			),
		});
	const codebaseId = crypto.randomUUID();
	const created = await (
		await handleCodebaseCreate({
			request: new Request("https://example.test/api/codebases", {
				method: "POST",
				body: JSON.stringify({ requestId: crypto.randomUUID() }),
			}),
		})
	).json();
	expect(codebaseId).toBeTruthy();
	expect(created.sync.projectId).toBe(created.id);
	const firstToken = created.sync.syncToken;
	const firstSessionId = created.sync.sessionId;

	// Generic metadata APIs never expose the credential.
	const metadataResponse = await handleCodebaseSessionRead({
		request: new Request("https://example.test/session"),
		params: { codebaseId: created.id },
	});
	const metadata = await metadataResponse.json();
	expect(metadata).toMatchObject({ sessionId: firstSessionId });
	const metadataJson = JSON.stringify(metadata);
	expect(metadataJson).not.toContain(firstToken);
	expect(metadataJson).not.toContain("credentialHash");

	// Stale id: another tab already replaced the named session. The server
	// reports the current row and mints nothing.
	const stale = await sessionRequest(created.id, {
		action: "retry",
		sessionId: "not-the-latest-session",
	});
	expect(stale.status).toBe(409);
	expect(await stale.json()).toMatchObject({
		code: "SYNC_SESSION_STALE",
		sessionId: firstSessionId,
	});
	let rows = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.codebaseId, created.id));
	expect(rows).toHaveLength(1);
	expect(rows[0]?.consumedAt).toBeNull();

	// A live CLI must never lose its credential to a recovery click.
	await db
		.update(s.codebaseSyncSessions)
		.set({ status: "uploading" })
		.where(eq(s.codebaseSyncSessions.id, firstSessionId));
	const active = await sessionRequest(created.id, {
		action: "retry",
		sessionId: firstSessionId,
	});
	expect(active.status).toBe(409);
	expect(await active.json()).toMatchObject({
		code: "SYNC_SESSION_ACTIVE",
		sessionId: firstSessionId,
	});
	rows = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.codebaseId, created.id));
	expect(rows).toHaveLength(1);
	expect(rows[0]?.status).toBe("uploading");
	expect(rows[0]?.consumedAt).toBeNull();

	// Recovery alone never mints or revokes.
	await db
		.update(s.codebaseSyncSessions)
		.set({ status: "waiting_for_cli" })
		.where(eq(s.codebaseSyncSessions.id, firstSessionId));
	const recoverOnly = await sessionRequest(created.id, { action: "recover" });
	expect(recoverOnly.status).toBe(409);
	expect(await recoverOnly.json()).toMatchObject({
		code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
		sessionId: firstSessionId,
	});
	rows = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.codebaseId, created.id));
	expect(rows).toHaveLength(1);
	expect(rows[0]?.consumedAt).toBeNull();

	// Explicit replacement: same codebase, old waiting credential revoked, new
	// credential minted for exactly this repository.
	const replaced = await sessionRequest(created.id, {
		action: "retry",
		sessionId: firstSessionId,
	});
	expect(replaced.status).toBe(200);
	const replacement = await replaced.json();
	expect(replacement.projectId).toBe(created.id);
	expect(replacement.sessionId).not.toBe(firstSessionId);
	expect(replacement.syncToken).not.toBe(firstToken);

	rows = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.codebaseId, created.id));
	expect(rows).toHaveLength(2);
	const old = rows.find((row) => row.id === firstSessionId);
	const current = rows.find((row) => row.id === replacement.sessionId);
	expect(old).toMatchObject({ status: "expired" });
	expect(old?.consumedAt).not.toBeNull();
	expect(current).toMatchObject({ status: "waiting_for_cli", attempt: 2 });
	expect(current?.credentialHash).toBe(hashSyncToken(replacement.syncToken));
	expect(current?.credentialHash).not.toBe(hashSyncToken(firstToken));

	// History stays one repository — no duplicate codebase was created.
	const history = await (
		await handleCodebaseList({
			request: new Request("https://example.test/api/codebases"),
		})
	).json();
	expect(history.codebases).toHaveLength(1);
	expect(history.codebases[0].id).toBe(created.id);
	expect(history.codebases[0].name).toBe(created.name);

	// Opening/refreshing the repository bills nothing.
	const [balance] = await db
		.select()
		.from(s.subscriptions)
		.where(eq(s.subscriptions.userId, auth.userId));
	expect(balance.creditsUsed).toBe(0);
	expect(balance.creditsReserved).toBe(0);
	expect(
		await db
			.select()
			.from(s.creditLedgerEntries)
			.where(eq(s.creditLedgerEntries.userId, auth.userId)),
	).toEqual([]);

	// An expired credential is replaceable without a new repository.
	await db
		.update(s.codebaseSyncSessions)
		.set({ expiresAt: new Date(Date.now() - 60_000) })
		.where(eq(s.codebaseSyncSessions.id, replacement.sessionId));
	const renewed = await sessionRequest(created.id, {
		action: "retry",
		sessionId: replacement.sessionId,
	});
	expect(renewed.status).toBe(200);
	const renewedPayload = await renewed.json();
	expect(renewedPayload.sessionId).not.toBe(replacement.sessionId);
	expect(renewedPayload.projectId).toBe(created.id);

	// A completed upload cannot be replaced; its snapshot is untouched.
	const snapshotId = crypto.randomUUID();
	await db.insert(s.codebaseSnapshots).values({
		id: snapshotId,
		codebaseId: created.id,
		syncSessionId: renewedPayload.sessionId,
		status: "uploaded",
		manifest: [],
		fileCount: 0,
	});
	await db
		.update(s.codebaseSyncSessions)
		.set({ status: "uploaded" })
		.where(eq(s.codebaseSyncSessions.id, renewedPayload.sessionId));
	const uploaded = await sessionRequest(created.id, {
		action: "retry",
		sessionId: renewedPayload.sessionId,
	});
	expect(uploaded.status).toBe(409);
	expect(await uploaded.json()).toMatchObject({
		code: "SYNC_SNAPSHOT_UPLOADED",
		sessionId: renewedPayload.sessionId,
	});
	const [snapshotRow] = await db
		.select()
		.from(s.codebaseSnapshots)
		.where(eq(s.codebaseSnapshots.id, snapshotId));
	expect(snapshotRow).toBeTruthy();
	rows = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.codebaseId, created.id));
	expect(rows).toHaveLength(3);
	expect(rows.find((row) => row.id === renewedPayload.sessionId)?.status).toBe(
		"uploaded",
	);

	// Tenant isolation: another signed-in user cannot recover or replace it.
	auth.userId = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@example.test`,
		name: "Other",
	});
	const foreign = await sessionRequest(created.id, {
		action: "retry",
		sessionId: renewedPayload.sessionId,
	});
	expect(foreign.status).toBe(404);
}, 30000);

test("replacement makes the old credential unusable and the new one live, without a new repository", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { handleCodebaseCreate } = await import(
		"../services/library-route.server"
	);
	const { handleCodebaseSessionCreate } = await import(
		"../services/sync-session-route.server"
	);
	const { handleCodebaseSyncHandshake } = await import(
		"../services/sync-handshake-route.server"
	);

	auth.userId = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@example.test`,
		name: "Rotation",
	});
	await db.insert(s.subscriptions).values({
		id: crypto.randomUUID(),
		userId: auth.userId,
		plan: "pro",
		credits: 100,
	});
	const created = await (
		await handleCodebaseCreate({
			request: new Request("https://example.test/api/codebases", {
				method: "POST",
				body: JSON.stringify({ requestId: crypto.randomUUID() }),
			}),
		})
	).json();
	const replacement = await (
		await handleCodebaseSessionCreate({
			params: { codebaseId: created.id },
			request: new Request(
				`https://example.test/api/codebases/${created.id}/session`,
				{
					method: "POST",
					body: JSON.stringify({
						action: "retry",
						sessionId: created.sync.sessionId,
					}),
				},
			),
		})
	).json();
	expect(replacement.syncToken).toBeTruthy();

	const handshake = (token: string) =>
		handleCodebaseSyncHandshake({
			params: { id: created.id },
			request: new Request(
				`https://example.test/api/v1/codebases/${created.id}/codebase/sync`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ cliVersion: "99.0.0" }),
				},
			),
		});

	// The revoked waiting credential is rejected.
	const oldHandshake = await handshake(created.sync.syncToken);
	expect(oldHandshake.status).toBe(401);
	expect(await oldHandshake.json()).toMatchObject({
		code: "SYNC_CREDENTIAL_REVOKED",
	});

	// The replacement credential is genuinely usable and bound to the same repo.
	const newHandshake = await handshake(replacement.syncToken);
	expect(newHandshake.status).toBe(200);
	expect(await newHandshake.json()).toMatchObject({
		sessionId: replacement.sessionId,
	});

	// Once the CLI is live, a recovery click must not revoke it.
	const blocked = await handleCodebaseSessionCreate({
		params: { codebaseId: created.id },
		request: new Request(
			`https://example.test/api/codebases/${created.id}/session`,
			{
				method: "POST",
				body: JSON.stringify({
					action: "retry",
					sessionId: replacement.sessionId,
				}),
			},
		),
	});
	expect(blocked.status).toBe(409);
	expect(await blocked.json()).toMatchObject({ code: "SYNC_SESSION_ACTIVE" });

	const [sessionRow] = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.id, replacement.sessionId));
	expect(sessionRow?.consumedAt).toBeNull();
	const codebases = await db
		.select()
		.from(s.codebases)
		.where(eq(s.codebases.userId, auth.userId));
	expect(codebases).toHaveLength(1);
}, 30000);
