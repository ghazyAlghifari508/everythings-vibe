import { and, eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

// Load server modules only after the fixture chooses its isolated schema.
test("replay preserves uploaded context, plans, unrelated repositories and Greenfield; rename/delete remain functional", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { handleCodebaseCreate } = await import(
		"../services/library-route.server"
	);
	const { handleCodebaseRename, handleCodebaseDelete } = await import(
		"../services/library-item-route.server"
	);
	auth.userId = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@test.local`,
		name: "P9 preservation",
		billingExempt: true,
	});
	const key = crypto.randomUUID();
	const create = (requestId: string) =>
		handleCodebaseCreate({
			request: new Request("https://test.local/api/codebases", {
				method: "POST",
				body: JSON.stringify({ requestId }),
			}),
		});
	const original = await (await create(key)).json();
	const sibling = await (await create(crypto.randomUUID())).json();
	const snapshotId = crypto.randomUUID();
	const featureId = crypto.randomUUID();
	const greenfieldId = crypto.randomUUID();
	await db
		.update(s.codebaseSyncSessions)
		.set({ status: "uploaded" })
		.where(
			and(
				eq(s.codebaseSyncSessions.id, original.sync.sessionId),
				eq(s.codebaseSyncSessions.userId, auth.userId),
			),
		);
	await db.insert(s.codebaseSnapshots).values({
		id: snapshotId,
		codebaseId: original.id,
		syncSessionId: original.sync.sessionId,
		status: "uploaded",
		manifest: [],
	});
	await db.insert(s.projects).values([
		{
			id: featureId,
			userId: auth.userId,
			codebaseId: original.id,
			name: "Saved feature",
			projectMode: "existing_codebase",
			step: "task",
		},
		{
			id: greenfieldId,
			userId: auth.userId,
			name: "Greenfield",
			projectMode: "greenfield",
			step: "prd",
		},
	]);
	const beforePlans = await db
		.select()
		.from(s.projects)
		.where(eq(s.projects.userId, auth.userId));
	const beforeSnapshots = await db
		.select()
		.from(s.codebaseSnapshots)
		.where(eq(s.codebaseSnapshots.codebaseId, original.id));
	for (let i = 0; i < 5; i++)
		expect(await (await create(key)).json()).toMatchObject({
			id: original.id,
			sessionId: original.sync.sessionId,
		});
	expect(
		await db
			.select()
			.from(s.projects)
			.where(eq(s.projects.userId, auth.userId)),
	).toEqual(beforePlans);
	expect(
		await db
			.select()
			.from(s.codebaseSnapshots)
			.where(eq(s.codebaseSnapshots.codebaseId, original.id)),
	).toEqual(beforeSnapshots);
	const rename = await handleCodebaseRename({
		params: { codebaseId: original.id },
		request: new Request("https://test.local/repo", {
			method: "PATCH",
			body: JSON.stringify({ name: "Renamed repository" }),
		}),
	});
	expect(rename.status).toBe(200);
	expect(await (await create(key)).json()).toMatchObject({
		id: original.id,
		name: "Renamed repository",
	});
	const deletion = await handleCodebaseDelete({
		params: { codebaseId: sibling.id },
		request: new Request("https://test.local/repo", {
			method: "DELETE",
			body: "{}",
		}),
	});
	expect(deletion.status).toBe(200);
	expect(
		(
			await db
				.select()
				.from(s.codebases)
				.where(eq(s.codebases.userId, auth.userId))
		).map((row) => row.id),
	).toEqual([original.id]);
	expect(
		await db
			.select()
			.from(s.projects)
			.where(eq(s.projects.userId, auth.userId)),
	).toEqual(beforePlans);
});

test("a stale prevalidated handshake cannot resurrect explicitly replaced credentials", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { runSyncHandshakeTransaction } = await import(
		"../services/sync-handshake-transaction.server"
	);
	const { prepareSyncSession } = await import(
		"../services/sync-session-prepare.server"
	);
	const { compareRepositoryIdentity } = await import(
		"../services/repository-identity"
	);
	auth.userId = crypto.randomUUID();
	const codebaseId = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@test.local`,
		name: "P9 race",
	});
	await db
		.insert(s.codebases)
		.values({ id: codebaseId, userId: auth.userId, name: "Race" });
	const original = await db.transaction((tx) =>
		prepareSyncSession(tx, auth.userId, codebaseId),
	);
	const replacement = await db.transaction((tx) =>
		prepareSyncSession(tx, auth.userId, codebaseId, original.session.id),
	);
	expect(replacement.token).not.toBeNull();
	await expect(
		runSyncHandshakeTransaction({
			sessionId: original.session.id,
			sessionStatus: "waiting_for_cli",
			sessionMetadata: null,
			codebaseId,
			userId: auth.userId,
			cliVersion: "2.0.0",
			repositoryName: null,
			repositoryIdentity: null,
			identityComparison: compareRepositoryIdentity(null, null),
		}),
	).rejects.toMatchObject({ code: "INVALID_SYNC_CREDENTIAL" });
	const [stored] = await db
		.select()
		.from(s.codebaseSyncSessions)
		.where(
			and(
				eq(s.codebaseSyncSessions.id, original.session.id),
				eq(s.codebaseSyncSessions.userId, auth.userId),
			),
		);
	expect(stored.status).toBe("expired");
});
