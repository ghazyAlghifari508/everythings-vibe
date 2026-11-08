import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";
import { auth, request, seed } from "./resync-db-fixture";

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

test("handshake racing a different tab's resync retains one upload and its credential", async () => {
	const f = await seed();
	const minted = await (
		await request(f.codebaseId, {
			action: "resync",
			requestId: crypto.randomUUID(),
		})
	).json();
	const { handleCodebaseSyncHandshake } = await import(
		"../services/sync-handshake-route.server"
	);
	const [connected, restored] = await Promise.all([
		handleCodebaseSyncHandshake({
			params: { id: f.codebaseId },
			request: new Request("https://test.local/sync", {
				method: "POST",
				headers: { Authorization: `Bearer ${minted.syncToken}` },
				body: JSON.stringify({ cliVersion: "3.2.1" }),
			}),
		}),
		request(f.codebaseId, { action: "resync", requestId: crypto.randomUUID() }),
	]);
	expect(connected.status).toBe(200);
	expect(restored.status).toBe(200);
	expect(await restored.json()).toMatchObject({ sessionId: minted.sessionId });
	const sessions = await f.db
		.select()
		.from(f.s.codebaseSyncSessions)
		.where(eq(f.s.codebaseSyncSessions.codebaseId, f.codebaseId));
	expect(sessions).toHaveLength(2);
	expect(
		sessions.find((session) => session.id === minted.sessionId),
	).toMatchObject({ status: "connected", consumedAt: null });
});

test("completed uploaded analysis admits a genuinely new request while replay stays on the prior attempt", async () => {
	const f = await seed();
	const requestId = crypto.randomUUID();
	const minted = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	const snapshotId = crypto.randomUUID();
	await f.db.insert(f.s.codebaseSnapshots).values({
		id: snapshotId,
		codebaseId: f.codebaseId,
		syncSessionId: minted.sessionId,
		status: "uploaded",
		manifest: [],
	});
	await f.db
		.update(f.s.codebaseSyncSessions)
		.set({ status: "uploaded" })
		.where(eq(f.s.codebaseSyncSessions.id, minted.sessionId));
	await f.db.insert(f.s.codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId: f.projectId,
		snapshotId,
		status: "ready",
		output: { projectId: f.projectId, snapshotId },
	});
	const replay = await (
		await request(f.codebaseId, { action: "resync", requestId })
	).json();
	expect(replay.sessionId).toBe(minted.sessionId);
	const next = await request(f.codebaseId, {
		action: "resync",
		requestId: crypto.randomUUID(),
	});
	expect(next.status).toBe(200);
	const payload = await next.json();
	expect(payload.sessionId).not.toBe(minted.sessionId);
	expect(payload.syncToken).not.toBe(minted.syncToken);
	expect(payload.codebaseId).toBe(f.codebaseId);
});
