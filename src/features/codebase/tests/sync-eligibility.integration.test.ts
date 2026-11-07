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

import { hashSyncToken } from "../services/sync.server";

test("eligible session APIs are idempotent, tenant scoped, free to open and expire safely", async () => {
	// The fixture selects an isolated schema in beforeAll, before loading the DB client.
	const { db } = await import("@/db");
	const schema = await import("@/db/schema");
	const { handleCodebaseCreate } = await import(
		"../services/library-route.server"
	);
	const { handleCodebaseSessionCreate } = await import(
		"../services/sync-session-route.server"
	);
	function create(requestId: string, extra = {}) {
		return handleCodebaseCreate({
			request: new Request("https://example.test/api/codebases", {
				method: "POST",
				body: JSON.stringify({ requestId, ...extra }),
			}),
		});
	}
	function session(codebaseId: string, body = {}) {
		return handleCodebaseSessionCreate({
			params: { codebaseId },
			request: new Request(
				`https://example.test/api/codebases/${codebaseId}/session`,
				{ method: "POST", body: JSON.stringify(body) },
			),
		});
	}
	auth.userId = crypto.randomUUID();
	await db.insert(schema.users).values({
		id: auth.userId,
		email: `${auth.userId}@example.test`,
		name: "Session",
		initialAnalysisUsedAt: new Date(),
	});
	await db.insert(schema.subscriptions).values({
		id: crypto.randomUUID(),
		userId: auth.userId,
		plan: "pro",
		credits: 100,
	});
	const requestId = crypto.randomUUID();
	const responses = await Promise.all([create(requestId), create(requestId)]);
	expect(responses.map((r) => r.status)).toEqual([200, 200]);
	const creationBodies = await Promise.all(responses.map((r) => r.json()));
	const first = creationBodies.find((body) => "sync" in body);
	const duplicate = creationBodies.find((body) => !("sync" in body));
	expect(duplicate).toMatchObject({
		id: first.id,
		sessionId: first.sync.sessionId,
		code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
	});
	expect(duplicate).not.toHaveProperty("sync");
	expect(responses[0].headers.get("Cache-Control")).toBe("no-store");
	const recovered = await session(first.id, { action: "recover" });
	expect(recovered.status).toBe(409);
	expect(await recovered.json()).toMatchObject({
		code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
		sessionId: first.sync.sessionId,
	});
	const rows = await db
		.select()
		.from(schema.codebaseSyncSessions)
		.where(eq(schema.codebaseSyncSessions.userId, auth.userId));
	expect(rows).toHaveLength(1);
	expect(rows[0].credentialHash).toBe(hashSyncToken(first.sync.syncToken));
	expect(JSON.stringify(rows)).not.toContain(first.sync.syncToken);
	const replacements = await Promise.all([
		session(first.id, { action: "retry", sessionId: first.sync.sessionId }),
		session(first.id, { action: "retry", sessionId: first.sync.sessionId }),
	]);
	const replacementBodies = await Promise.all(
		replacements.map((r) => r.json()),
	);
	const rotated =
		replacementBodies[replacements.findIndex((r) => r.status === 200)];
	const repeated =
		replacementBodies[replacements.findIndex((r) => r.status === 409)];
	expect(rotated.sessionId).toBe(repeated.sessionId);
	expect(replacements.map((response) => response.status).sort()).toEqual([
		200, 409,
	]);
	expect(repeated).not.toHaveProperty("syncToken");
	expect(rotated.syncToken).not.toBe(first.sync.syncToken);
	await db
		.update(schema.codebaseSyncSessions)
		.set({ expiresAt: new Date(Date.now() - 1000) })
		.where(
			and(
				eq(schema.codebaseSyncSessions.id, rotated.sessionId),
				eq(schema.codebaseSyncSessions.userId, auth.userId),
			),
		);
	const renewed = await (await session(first.id)).json();
	expect(renewed.syncToken).not.toBe(rotated.syncToken);
	const [balance] = await db
		.select()
		.from(schema.subscriptions)
		.where(eq(schema.subscriptions.userId, auth.userId));
	expect(balance.creditsUsed).toBe(0);
	expect(balance.creditsReserved).toBe(0);
	const ledger = await db
		.select()
		.from(schema.creditLedgerEntries)
		.where(eq(schema.creditLedgerEntries.userId, auth.userId));
	expect(ledger).toEqual([]);
	await db
		.update(schema.subscriptions)
		.set({ credits: 0 })
		.where(eq(schema.subscriptions.userId, auth.userId));
	const blocked = await create(crypto.randomUUID(), {
		canStart: true,
		billingExempt: true,
		creditConsent: { maximumCredits: 1000 },
	});
	expect(blocked.status).toBe(403);
	expect(await blocked.json()).not.toHaveProperty("syncToken");
	expect((await session(first.id)).status).toBe(403);
	await db
		.update(schema.users)
		.set({ billingExempt: true, billingExemptionReason: "development" })
		.where(eq(schema.users.id, auth.userId));
	expect((await create(crypto.randomUUID())).status).toBe(200);
	const owner = auth.userId;
	auth.userId = crypto.randomUUID();
	await db.insert(schema.users).values({
		id: auth.userId,
		email: `${auth.userId}@example.test`,
		name: "Other",
	});
	const unavailable = await create(crypto.randomUUID());
	expect(unavailable.status).toBe(503);
	expect(await unavailable.json()).toMatchObject({
		code: "BILLING_UNAVAILABLE",
		canStart: false,
	});
	expect((await session(first.id)).status).toBe(404);
	const others = await db
		.select()
		.from(schema.codebaseSyncSessions)
		.where(eq(schema.codebaseSyncSessions.userId, auth.userId));
	expect(others).toEqual([]);
	auth.userId = owner;
}, 30000);
