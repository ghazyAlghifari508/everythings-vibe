import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";

import { auth, request, seed } from "./resync-db-fixture";
import { analyzeSnapshot, uploadSnapshot } from "./resync-upload-fixture";

vi.mock("@/lib/session", () => ({
	requireUser: async () => {
		if (!auth.userId) throw new Error("Unauthorized");
		return { id: auth.userId };
	},
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("../services/analysis-server-generate", async () => {
	const { generatedAnalysis } = await import("./resync-upload-fixture");
	return { defaultGenerate: async () => generatedAnalysis() };
});

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
	const repository = await f.db
		.select()
		.from(f.s.codebases)
		.where(eq(f.s.codebases.userId, f.userId));
	const handoffs = await f.db
		.select()
		.from(f.s.codebaseAskHandoffs)
		.where(eq(f.s.codebaseAskHandoffs.userId, f.userId));
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
			.from(f.s.creditLedgerEntries)
			.where(eq(f.s.creditLedgerEntries.userId, f.userId)),
	).toEqual([]);
	const [balance] = await f.db
		.select()
		.from(f.s.subscriptions)
		.where(eq(f.s.subscriptions.userId, f.userId));
	expect(balance).toMatchObject({ creditsUsed: 0, creditsReserved: 0 });
	// A lost response restores the same authoritative attempt, never its secret.
	const restored = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	expect(restored).toMatchObject({ sessionId, status: "waiting_for_cli" });
	expect(restored.syncToken).toBeUndefined();
	const snapshotId = await uploadSnapshot(f.codebaseId, minted.syncToken);
	expect((await analyzeSnapshot(f.projectId, snapshotId)).status).toBe(200);
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
	expect(
		await f.db
			.select()
			.from(f.s.codebases)
			.where(eq(f.s.codebases.userId, f.userId)),
	).toEqual(repository);
	expect(
		await f.db
			.select()
			.from(f.s.codebaseAskHandoffs)
			.where(eq(f.s.codebaseAskHandoffs.userId, f.userId)),
	).toEqual(handoffs);
	expect(
		await f.db
			.select()
			.from(f.s.codebaseSnapshots)
			.where(eq(f.s.codebaseSnapshots.id, f.snapshotId)),
	).toEqual(before);
	const replay = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	expect(replay).toMatchObject({ sessionId, status: "uploaded" });
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

test("credit restriction blocks new attempts but never hides a previously accepted operation", async () => {
	const f = await seed();
	const requestId = crypto.randomUUID();
	const accepted = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	const snapshotId = await uploadSnapshot(f.codebaseId, accepted.syncToken);
	expect((await analyzeSnapshot(f.projectId, snapshotId)).status).toBe(200);
	await f.db
		.update(f.s.subscriptions)
		.set({ credits: 0 })
		.where(eq(f.s.subscriptions.userId, f.userId));
	const restored = await request(f.codebaseId, { action: "resync", requestId });
	expect(restored.status).toBe(200);
	expect(await restored.json()).toMatchObject({
		sessionId: accepted.sessionId,
	});
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
