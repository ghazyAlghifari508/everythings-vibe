import { and, eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";

import { auth, request, seed } from "./resync-db-fixture";

vi.mock("@/lib/session", () => ({
	requireUser: async () => {
		if (!auth.userId) throw new Error("Unauthorized");
		return { id: auth.userId };
	},
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

test("uploaded repository starts one new resync under concurrent tabs without altering prior context or charging", async () => {
	const f = await seed();
	const before = await f.db
		.select()
		.from(f.s.codebaseSnapshots)
		.where(eq(f.s.codebaseSnapshots.codebaseId, f.codebaseId));
	const analyses = await f.db
		.select()
		.from(f.s.codebaseAnalyses)
		.where(eq(f.s.codebaseAnalyses.projectId, f.projectId));
	const plans = await f.db
		.select()
		.from(f.s.projects)
		.where(eq(f.s.projects.userId, f.userId));
	const artifacts = await Promise.all([
		f.db
			.select()
			.from(f.s.prdVersions)
			.where(eq(f.s.prdVersions.projectId, f.projectId)),
		f.db
			.select()
			.from(f.s.acVersions)
			.where(eq(f.s.acVersions.projectId, f.projectId)),
		f.db.select().from(f.s.tasks).where(eq(f.s.tasks.projectId, f.projectId)),
		f.db
			.select()
			.from(f.s.codebaseGenerationContexts)
			.where(eq(f.s.codebaseGenerationContexts.projectId, f.projectId)),
	]);
	const requestId = crypto.randomUUID();
	const responses = await Promise.all(
		Array.from({ length: 6 }, (_, index) =>
			request(f.codebaseId, {
				action: "resync",
				requestId: index < 3 ? requestId : crypto.randomUUID(),
				sessionId: f.sessionId,
			}),
		),
	);
	expect(responses.map((response) => response.status)).toEqual([
		200, 200, 200, 200, 200, 200,
	]);
	const payloads = await Promise.all(
		responses.map((response) => response.json()),
	);
	const sessionId = payloads[0].sessionId;
	expect(new Set(payloads.map((payload) => payload.sessionId))).toEqual(
		new Set([sessionId]),
	);
	expect(sessionId).not.toBe(f.sessionId);
	const minted = payloads.find((payload) => payload.syncToken);
	expect(minted.syncToken).not.toBe(f.token);
	const { hashSyncToken } = await import("../services/sync.server");
	const rows = await f.db
		.select()
		.from(f.s.codebaseSyncSessions)
		.where(eq(f.s.codebaseSyncSessions.codebaseId, f.codebaseId));
	expect(rows).toHaveLength(2);
	expect(rows.find((row) => row.id === sessionId)).toMatchObject({
		credentialHash: hashSyncToken(minted.syncToken),
		status: "waiting_for_cli",
		attempt: 2,
		codebaseId: f.codebaseId,
	});
	expect(
		await f.db
			.select()
			.from(f.s.codebaseSnapshots)
			.where(eq(f.s.codebaseSnapshots.codebaseId, f.codebaseId)),
	).toEqual(before);
	expect(
		await f.db
			.select()
			.from(f.s.codebaseAnalyses)
			.where(eq(f.s.codebaseAnalyses.projectId, f.projectId)),
	).toEqual(analyses);
	expect(
		await f.db
			.select()
			.from(f.s.projects)
			.where(eq(f.s.projects.userId, f.userId)),
	).toEqual(plans);
	expect(
		await f.db
			.select()
			.from(f.s.codebases)
			.where(eq(f.s.codebases.userId, f.userId)),
	).toHaveLength(1);
	expect(
		await f.db
			.select()
			.from(f.s.creditLedgerEntries)
			.where(eq(f.s.creditLedgerEntries.userId, f.userId)),
	).toEqual([]);
	const [balance] = await f.db
		.select()
		.from(f.s.subscriptions)
		.where(eq(f.s.subscriptions.userId, f.userId));
	expect(balance).toMatchObject({ creditsUsed: 0, creditsReserved: 0 });
	expect(
		await Promise.all([
			f.db
				.select()
				.from(f.s.prdVersions)
				.where(eq(f.s.prdVersions.projectId, f.projectId)),
			f.db
				.select()
				.from(f.s.acVersions)
				.where(eq(f.s.acVersions.projectId, f.projectId)),
			f.db.select().from(f.s.tasks).where(eq(f.s.tasks.projectId, f.projectId)),
			f.db
				.select()
				.from(f.s.codebaseGenerationContexts)
				.where(eq(f.s.codebaseGenerationContexts.projectId, f.projectId)),
		]),
	).toEqual(artifacts);
	// A lost response restores the same authoritative attempt, never its secret.
	const restored = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	expect(restored).toMatchObject({ sessionId, status: "waiting_for_cli" });
	expect(restored.syncToken).toBeUndefined();
	await f.db
		.update(f.s.codebaseSyncSessions)
		.set({ status: "ready" })
		.where(
			and(
				eq(f.s.codebaseSyncSessions.id, sessionId),
				eq(f.s.codebaseSyncSessions.userId, f.userId),
			),
		);
	const replay = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	expect(replay).toMatchObject({ sessionId, status: "ready" });
	const next = await (
		await request(f.codebaseId, {
			action: "resync",
			requestId: crypto.randomUUID(),
		})
	).json();
	expect(next.sessionId).not.toBe(sessionId);
	expect(next.syncToken).toBeTypeOf("string");
}, 30000);

test("resync rejects foreign ownership and unauthenticated requests", async () => {
	const f = await seed();
	auth.userId = crypto.randomUUID();
	expect(
		(
			await request(f.codebaseId, {
				action: "resync",
				requestId: crypto.randomUUID(),
			})
		).status,
	).toBe(404);
	auth.userId = "";
	expect(
		(
			await request(f.codebaseId, {
				action: "resync",
				requestId: crypto.randomUUID(),
			})
		).status,
	).toBe(401);
});

test("active CLI, stale replacement and expired unused recovery never corrupt an attempt", async () => {
	const f = await seed();
	const requestId = crypto.randomUUID();
	const minted = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	const { handleCodebaseSyncHandshake } = await import(
		"../services/sync-handshake-route.server"
	);
	const handshake = () =>
		handleCodebaseSyncHandshake({
			params: { id: f.codebaseId },
			request: new Request(
				`https://test.local/api/v1/codebases/${f.codebaseId}/codebase/sync`,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${minted.syncToken}` },
					body: JSON.stringify({ cliVersion: "3.2.1" }),
				},
			),
		});
	expect((await handshake()).status).toBe(200);
	const active = await (
		await request(f.codebaseId, {
			action: "resync",
			requestId: crypto.randomUUID(),
		})
	).json();
	expect(active).toMatchObject({
		sessionId: minted.sessionId,
		status: "connected",
	});
	const stale = await request(f.codebaseId, {
		action: "retry",
		sessionId: f.sessionId,
	});
	expect(stale.status).toBe(409);
	expect(await stale.json()).toMatchObject({
		code: "SYNC_SESSION_STALE",
		sessionId: minted.sessionId,
	});
	const replacement = await request(f.codebaseId, {
		action: "retry",
		sessionId: minted.sessionId,
	});
	expect(replacement.status).toBe(409);
	expect(await replacement.json()).toMatchObject({
		code: "SYNC_SESSION_ACTIVE",
	});
	expect((await handshake()).status).toBe(200);
	await f.db
		.update(f.s.codebaseSyncSessions)
		.set({ status: "failed" })
		.where(eq(f.s.codebaseSyncSessions.id, minted.sessionId));
	const unused = await (
		await request(f.codebaseId, {
			action: "resync",
			requestId: crypto.randomUUID(),
		})
	).json();
	const expiry = new Date(Date.now() - 1000);
	await f.db
		.update(f.s.codebaseSyncSessions)
		.set({ expiresAt: expiry })
		.where(eq(f.s.codebaseSyncSessions.id, unused.sessionId));
	const renewed = await request(f.codebaseId, {
		action: "retry",
		sessionId: unused.sessionId,
	});
	expect(renewed.status).toBe(200);
	expect((await renewed.json()).sessionId).not.toBe(unused.sessionId);
	const [old] = await f.db
		.select()
		.from(f.s.codebaseSyncSessions)
		.where(eq(f.s.codebaseSyncSessions.id, unused.sessionId));
	expect(old?.consumedAt).toBeInstanceOf(Date);
}, 30000);

test("workspace snapshot advances only with matching readable analysis and survives failure", async () => {
	const f = await seed();
	const { readWorkspaceSnapshot } = await import(
		"../services/workspace-snapshot.server"
	);
	const { readSyncStatusSnapshot } = await import(
		"../services/sync-status-snapshot.server"
	);
	const minted = await (
		await request(f.codebaseId, {
			action: "resync",
			requestId: crypto.randomUUID(),
		})
	).json();
	const snapshotId = crypto.randomUUID();
	await f.db.insert(f.s.codebaseSnapshots).values({
		id: snapshotId,
		codebaseId: f.codebaseId,
		syncSessionId: minted.sessionId,
		status: "uploaded",
		manifest: [],
		createdAt: new Date(Date.now() + 1000),
	});
	await f.db
		.update(f.s.codebaseSyncSessions)
		.set({ status: "uploaded" })
		.where(eq(f.s.codebaseSyncSessions.id, minted.sessionId));
	expect((await readWorkspaceSnapshot(f.userId, f.codebaseId))?.id).toBe(
		f.snapshotId,
	);
	await f.db.insert(f.s.codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId: f.projectId,
		snapshotId,
		status: "failed",
	});
	expect((await readWorkspaceSnapshot(f.userId, f.codebaseId))?.id).toBe(
		f.snapshotId,
	);
	await f.db.insert(f.s.codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId: f.projectId,
		snapshotId,
		status: "ready",
		output: { projectId: f.projectId, snapshotId: f.snapshotId },
	});
	expect((await readWorkspaceSnapshot(f.userId, f.codebaseId))?.id).toBe(
		f.snapshotId,
	);
	const analysisId = crypto.randomUUID();
	await f.db.insert(f.s.codebaseAnalyses).values({
		id: analysisId,
		projectId: f.projectId,
		snapshotId,
		status: "ready",
		output: { projectId: f.projectId, snapshotId },
	});
	expect((await readWorkspaceSnapshot(f.userId, f.codebaseId))?.id).toBe(
		snapshotId,
	);
	const status = await readSyncStatusSnapshot({
		userId: f.userId,
		codebaseId: f.codebaseId,
		sessionId: minted.sessionId,
		projectId: f.projectId,
	});
	expect(status).toMatchObject({
		ok: true,
		snapshot: {
			sessionId: minted.sessionId,
			snapshotId,
			workspaceSnapshotId: snapshotId,
			analysisId,
			analysisStatus: "ready",
		},
	});
}, 30000);

test("credit restriction blocks new attempts but never hides a previously accepted operation", async () => {
	const f = await seed();
	const requestId = crypto.randomUUID();
	const accepted = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	await f.db
		.update(f.s.subscriptions)
		.set({ credits: 0 })
		.where(eq(f.s.subscriptions.userId, f.userId));
	const restored = await request(f.codebaseId, { action: "resync", requestId });
	expect(restored.status).toBe(200);
	expect(await restored.json()).toMatchObject({
		sessionId: accepted.sessionId,
	});
	await f.db
		.update(f.s.codebaseSyncSessions)
		.set({ status: "ready" })
		.where(eq(f.s.codebaseSyncSessions.id, accepted.sessionId));
	const blocked = await request(f.codebaseId, {
		action: "resync",
		requestId: crypto.randomUUID(),
	});
	expect(blocked.status).toBe(403);
	expect(await blocked.json()).toMatchObject({ code: "INSUFFICIENT_CREDITS" });
});

test("lost prompt replacement updates the same request alias and rejects the old credential", async () => {
	const f = await seed();
	const requestId = crypto.randomUUID();
	const accepted = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	const replacement = await (
		await request(f.codebaseId, {
			action: "retry",
			sessionId: accepted.sessionId,
		})
	).json();
	expect(replacement.sessionId).not.toBe(accepted.sessionId);
	const replay = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	expect(replay.sessionId).toBe(replacement.sessionId);
	const { handleCodebaseSyncHandshake } = await import(
		"../services/sync-handshake-route.server"
	);
	const result = await handleCodebaseSyncHandshake({
		params: { id: f.codebaseId },
		request: new Request("https://test.local/sync", {
			method: "POST",
			headers: { Authorization: `Bearer ${accepted.syncToken}` },
			body: JSON.stringify({ cliVersion: "3.2.1" }),
		}),
	});
	expect(result.status).toBe(401);
	expect(await result.json()).toMatchObject({
		code: "SYNC_CREDENTIAL_REVOKED",
	});
});
