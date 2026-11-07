import { and, eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { cleanupPool } from "./analysis-credit-db-fixture";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

// Dynamic imports deliberately wait until beforeAll selects the isolated DB schema.
async function database() {
	return { db: (await import("@/db")).db, s: await import("@/db/schema") };
}
async function owner(exempt = true) {
	const { db, s } = await database();
	const id = crypto.randomUUID();
	await db.insert(s.users).values({
		id,
		email: `${id}@test.local`,
		name: "P9",
		billingExempt: exempt,
		initialAnalysisUsedAt: exempt ? null : new Date(),
	});
	if (!exempt)
		await db
			.insert(s.subscriptions)
			.values({ id: crypto.randomUUID(), userId: id, plan: "pro", credits: 0 });
	return id;
}
beforeEach(async () => {
	auth.userId = await owner();
});

async function create(requestId: string | undefined, name?: string) {
	const { handleCodebaseCreate } = await import(
		"../services/library-route.server"
	);
	return handleCodebaseCreate({
		request: new Request("https://test.local/api/codebases", {
			method: "POST",
			body: JSON.stringify({ requestId, name }),
		}),
	});
}
async function sessions(codebaseId: string) {
	const { db, s } = await database();
	return db
		.select()
		.from(s.codebaseSyncSessions)
		.where(
			and(
				eq(s.codebaseSyncSessions.codebaseId, codebaseId),
				eq(s.codebaseSyncSessions.userId, auth.userId),
			),
		);
}
async function repositories() {
	const { db, s } = await database();
	return db
		.select()
		.from(s.codebases)
		.where(eq(s.codebases.userId, auth.userId));
}
async function sessionRequest(codebaseId: string, body: object) {
	const { handleCodebaseSessionCreate } = await import(
		"../services/sync-session-route.server"
	);
	return handleCodebaseSessionCreate({
		params: { codebaseId },
		request: new Request("https://test.local/session", {
			method: "POST",
			body: JSON.stringify(body),
		}),
	});
}

test("requires a valid stable operation identity before persistence", async () => {
	for (const key of [undefined, "bad-key"])
		expect((await create(key)).status).toBe(400);
	expect(await repositories()).toEqual([]);
});

test("five sequential retries reuse one repository and initial session without replaying the raw token", async () => {
	const key = crypto.randomUUID();
	const first = await create(key);
	expect(first.status).toBe(200);
	const initial = await first.json();
	expect(initial.sync.projectId).toBe(initial.id);
	for (let i = 0; i < 5; i++) {
		const response = await create(key);
		expect(response.status).toBe(200);
		const replay = await response.json();
		expect(replay).toMatchObject({
			id: initial.id,
			sessionId: initial.sync.sessionId,
			code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
		});
		expect(JSON.stringify(replay)).not.toContain(initial.sync.syncToken);
	}
	expect((await repositories()).map((row) => row.id)).toEqual([initial.id]);
	expect((await sessions(initial.id)).map((row) => row.id)).toEqual([
		initial.sync.sessionId,
	]);
});

test("ten concurrent requests before commit create one repository and canonical initial operation", async () => {
	const key = crypto.randomUUID();
	const responses = await Promise.all(
		Array.from({ length: 10 }, () => create(key)),
	);
	expect(responses.map((response) => response.status)).toEqual(
		Array(10).fill(200),
	);
	const bodies = await Promise.all(
		responses.map((response) => response.json()),
	);
	expect(new Set(bodies.map((body) => body.id)).size).toBe(1);
	expect(bodies.filter((body) => body.sync).length).toBe(1);
	const rows = await repositories();
	expect(rows.map((row) => row.id)).toEqual([bodies[0].id]);
	expect((await sessions(bodies[0].id)).length).toBe(1);
});

test("same key cannot expose another tenant and intentional same-name attempts remain distinct", async () => {
	const key = crypto.randomUUID();
	const first = await (await create(key, "same-name")).json();
	const another = await (await create(crypto.randomUUID(), "same-name")).json();
	expect(another.id).not.toBe(first.id);
	expect((await repositories()).map((row) => row.name)).toEqual([
		"same-name",
		"same-name",
	]);
	auth.userId = await owner();
	const otherTenant = await (await create(key, "same-name")).json();
	expect(otherTenant.id).not.toBe(first.id);
	expect((await repositories()).map((row) => row.id)).toEqual([otherTenant.id]);
	expect((await sessionRequest(first.id, { action: "recover" })).status).toBe(
		404,
	);
});

test("incompatible reuse conflicts even after the user renames the repository", async () => {
	const key = crypto.randomUUID();
	const first = await (await create(key, "original")).json();
	const { db, s } = await database();
	await db
		.update(s.codebases)
		.set({ name: "renamed" })
		.where(
			and(eq(s.codebases.id, first.id), eq(s.codebases.userId, auth.userId)),
		);
	expect((await create(key, "original")).status).toBe(200);
	const conflict = await create(key, "different");
	expect(conflict.status).toBe(409);
	expect(await conflict.json()).toMatchObject({
		code: "CODEBASE_ATTEMPT_CONFLICT",
	});
	expect((await repositories()).map((row) => row.name)).toEqual(["renamed"]);
});

test("lost response recovery preserves identity, requires explicit token replacement and revokes only the named waiting session", async () => {
	const key = crypto.randomUUID();
	const first = await (await create(key)).json();
	const replay = await (await create(key)).json();
	expect(replay.id).toBe(first.id);
	const recovery = await sessionRequest(first.id, { action: "recover" });
	expect(recovery.status).toBe(409);
	expect(await recovery.json()).toMatchObject({
		code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
		sessionId: first.sync.sessionId,
	});
	const replacement = await sessionRequest(first.id, {
		action: "retry",
		sessionId: first.sync.sessionId,
	});
	expect(replacement.status).toBe(200);
	const payload = await replacement.json();
	expect(payload.projectId).toBe(first.id);
	expect(payload.syncToken).not.toBe(first.sync.syncToken);
	const repeatedReplacement = await sessionRequest(first.id, {
		action: "retry",
		sessionId: first.sync.sessionId,
	});
	expect(repeatedReplacement.status).toBe(409);
	const rows = await sessions(first.id);
	expect(rows.length).toBe(2);
	expect(rows.find((row) => row.id === first.sync.sessionId)).toMatchObject({
		status: "expired",
	});
	expect(
		rows.find((row) => row.id === payload.sessionId)?.credentialHash,
	).not.toBe(payload.syncToken);
	expect((await repositories()).length).toBe(1);
});

test("expired credentials replace under the same repository; concurrent replacement has one winner", async () => {
	const key = crypto.randomUUID();
	const first = await (await create(key)).json();
	const { db, s } = await database();
	await db
		.update(s.codebaseSyncSessions)
		.set({ expiresAt: new Date(0) })
		.where(
			and(
				eq(s.codebaseSyncSessions.id, first.sync.sessionId),
				eq(s.codebaseSyncSessions.userId, auth.userId),
			),
		);
	await create(key);
	expect((await sessions(first.id)).length).toBe(1);
	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			sessionRequest(first.id, {
				action: "retry",
				sessionId: first.sync.sessionId,
			}),
		),
	);
	expect(results.filter((response) => response.status === 200).length).toBe(1);
	expect((await sessions(first.id)).length).toBe(2);
	expect((await repositories()).length).toBe(1);
});

test("active CLI credentials and uploaded snapshots cannot be replaced even by retry", async () => {
	const first = await (await create(crypto.randomUUID())).json();
	const { db, s } = await database();
	for (const status of [
		"connected",
		"scanning",
		"filtering",
		"uploading",
		"uploaded",
		"analyzing",
		"ready",
	]) {
		await db
			.update(s.codebaseSyncSessions)
			.set({ status })
			.where(
				and(
					eq(s.codebaseSyncSessions.id, first.sync.sessionId),
					eq(s.codebaseSyncSessions.userId, auth.userId),
				),
			);
		expect(
			(
				await sessionRequest(first.id, {
					action: "retry",
					sessionId: first.sync.sessionId,
				})
			).status,
		).toBe(409);
		expect((await sessions(first.id)).map((row) => row.id)).toEqual([
			first.sync.sessionId,
		]);
	}
});

test("session insert failure rolls the repository back and the same key can retry", async () => {
	if (!cleanupPool) throw new Error("Isolated database unavailable");
	await cleanupPool.query(
		"CREATE FUNCTION reject_p9_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced session persistence failure'; END $$",
	);
	await cleanupPool.query(
		"CREATE TRIGGER reject_p9_session BEFORE INSERT ON codebase_sync_sessions FOR EACH ROW EXECUTE FUNCTION reject_p9_session()",
	);
	const key = crypto.randomUUID();
	try {
		expect((await create(key)).status).toBe(500);
		expect(await repositories()).toEqual([]);
		const { db, s } = await database();
		expect(
			await db
				.select()
				.from(s.codebaseSyncSessions)
				.where(eq(s.codebaseSyncSessions.userId, auth.userId)),
		).toEqual([]);
	} finally {
		await cleanupPool.query(
			"DROP TRIGGER reject_p9_session ON codebase_sync_sessions",
		);
		await cleanupPool.query("DROP FUNCTION reject_p9_session()");
	}
	expect((await create(key)).status).toBe(200);
});

test("database primary key rejects duplicate attempts outside the handler", async () => {
	const first = await (await create(crypto.randomUUID())).json();
	const { db, s } = await database();
	await expect(
		db
			.insert(s.codebases)
			.values({ id: first.id, userId: auth.userId, name: "duplicate" }),
	).rejects.toThrow();
	expect((await repositories()).length).toBe(1);
});

test("server credit denial creates no repository, exempt create reserves and deducts nothing, History exposes no credentials", async () => {
	auth.userId = await owner(false);
	expect((await create(crypto.randomUUID())).status).toBe(403);
	expect(await repositories()).toEqual([]);
	auth.userId = await owner();
	const first = await (await create(crypto.randomUUID())).json();
	const { db, s } = await database();
	expect(
		await db
			.select()
			.from(s.creditOperations)
			.where(eq(s.creditOperations.userId, auth.userId)),
	).toEqual([]);
	const { handleCodebaseList } = await import(
		"../services/library-route.server"
	);
	const history = await (
		await handleCodebaseList({
			request: new Request("https://test.local/api/codebases"),
		})
	).json();
	expect(history.codebases.map((row: { id: string }) => row.id)).toEqual([
		first.id,
	]);
	expect(JSON.stringify(history)).not.toContain(first.sync.syncToken);
	expect(JSON.stringify(history)).not.toContain("credentialHash");
});
