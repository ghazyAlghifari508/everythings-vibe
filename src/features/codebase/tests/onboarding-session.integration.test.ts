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

test("session recovery never borrows another session snapshot or expires uploaded context", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { readSyncStatusSnapshot } = await import(
		"../services/sync-status-snapshot.server"
	);
	const { handleCodebaseSessionCreate, handleCodebaseSessionRead } =
		await import("../services/sync-session-route.server");
	auth.userId = crypto.randomUUID();
	const repo = crypto.randomUUID();
	const uploaded = crypto.randomUUID();
	const expired = crypto.randomUUID();
	const snapshot = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@test.local`,
		name: "Lifecycle",
		billingExempt: true,
	});
	await db
		.insert(s.codebases)
		.values({ id: repo, userId: auth.userId, name: "Repository" });
	await db.insert(s.codebaseSyncSessions).values([
		{
			id: uploaded,
			codebaseId: repo,
			userId: auth.userId,
			credentialHash: "test",
			status: "uploaded",
			expiresAt: new Date(0),
			createdAt: new Date(1),
		},
		{
			id: expired,
			codebaseId: repo,
			userId: auth.userId,
			credentialHash: "test",
			status: "expired",
			expiresAt: new Date(0),
			createdAt: new Date(2),
		},
	]);
	await db.insert(s.codebaseSnapshots).values({
		id: snapshot,
		codebaseId: repo,
		syncSessionId: uploaded,
		status: "uploaded",
		manifest: [],
		fileCount: 0,
	});
	const read = (sessionId: string) =>
		readSyncStatusSnapshot({
			userId: auth.userId,
			codebaseId: repo,
			sessionId,
			projectId: null,
			reconcileCredits: false,
		});
	const old = await read(expired);
	expect(old).toMatchObject({
		ok: true,
		snapshot: { sessionId: expired, snapshotId: null, status: "expired" },
	});
	const current = await read(uploaded);
	expect(current).toMatchObject({
		ok: true,
		snapshot: { sessionId: uploaded, snapshotId: snapshot, status: "uploaded" },
	});
	await db
		.update(s.codebaseSyncSessions)
		.set({ createdAt: new Date() })
		.where(eq(s.codebaseSyncSessions.id, uploaded));
	const metadata = await handleCodebaseSessionRead({
		request: new Request("https://test.local/session"),
		params: { codebaseId: repo },
	});
	expect(await metadata.json()).toMatchObject({
		sessionId: uploaded,
		status: "uploaded",
	});
	const renewal = await handleCodebaseSessionCreate({
		request: new Request("https://test.local/session", {
			method: "POST",
			body: JSON.stringify({ action: "recover" }),
		}),
		params: { codebaseId: repo },
	});
	expect(renewal.status).toBe(409);
	expect(await renewal.json()).toMatchObject({
		code: "SYNC_SNAPSHOT_UPLOADED",
		sessionId: uploaded,
	});
	const sessions = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(eq(s.codebaseSyncSessions.codebaseId, repo));
	expect(sessions.map((row) => row.id).sort()).toEqual(
		[uploaded, expired].sort(),
	);
	const project = crypto.randomUUID();
	const otherRepo = crypto.randomUUID();
	const otherSession = crypto.randomUUID();
	const otherSnapshot = crypto.randomUUID();
	await db
		.insert(s.codebases)
		.values({ id: otherRepo, userId: auth.userId, name: "Other repository" });
	await db.insert(s.projects).values({
		id: project,
		userId: auth.userId,
		codebaseId: repo,
		name: "Anchor",
		projectMode: "existing_codebase",
	});
	await db
		.update(s.codebases)
		.set({ onboardingProjectId: project })
		.where(eq(s.codebases.id, repo));
	await db.insert(s.codebaseSyncSessions).values({
		id: otherSession,
		codebaseId: otherRepo,
		userId: auth.userId,
		status: "uploaded",
		credentialHash: "test",
		expiresAt: new Date(0),
	});
	await db.insert(s.codebaseSnapshots).values({
		id: otherSnapshot,
		codebaseId: otherRepo,
		syncSessionId: otherSession,
		status: "uploaded",
		manifest: [],
	});
	expect(await read(uploaded)).toMatchObject({
		ok: true,
		snapshot: { analysisProjectId: project },
	});
	expect(await read(otherSession)).toMatchObject({ ok: false, status: 404 });
	const { triggerCodebaseAnalysis } = await import(
		"../services/analysis-route-trigger.server"
	);
	const analysisRequest = (snapshotId: string) =>
		new Request("https://test.local/analysis", {
			method: "POST",
			body: JSON.stringify({ snapshotId }),
		});
	expect(
		(await triggerCodebaseAnalysis(analysisRequest(otherSnapshot), project))
			.status,
	).toBe(404);
	const owner = auth.userId;
	auth.userId = crypto.randomUUID();
	expect(await read(uploaded)).toMatchObject({ ok: false, status: 404 });
	expect(
		(await triggerCodebaseAnalysis(analysisRequest(snapshot), project)).status,
	).toBe(404);
	auth.userId = owner;
}, 30000);
