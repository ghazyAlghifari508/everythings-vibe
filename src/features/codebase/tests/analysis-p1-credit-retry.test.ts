import assert from "node:assert/strict";
import { test } from "vitest";
import "./analysis-credit-db-fixture";

// P1 regression: retry after a terminal reservation must mint a fresh active
// operation with a fresh analysis identity, never reuse a settled/released
// operation (double charge / generation against a dead reservation).
test("codebase analysis retry never reuses a terminal credit operation", async () => {
	const { db } = await import("@/db");
	const schema = await import("@/db/schema");
	const credits = await import("@/lib/services/credit-service");
	const { eq } = await import("drizzle-orm");

	const userId = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	await db
		.insert(schema.users)
		.values([
			{ id: userId, email: `${userId}@example.test`, name: "P1 retry" },
		]);
	await db
		.insert(schema.projects)
		.values([
			{ id: projectId, userId, name: "P1", projectMode: "existing_codebase" },
		]);
	await db.insert(schema.subscriptions).values([
		{
			id: crypto.randomUUID(),
			userId,
			plan: "pro",
			credits: 100,
			currentPeriodEnd: null,
		},
	]);

	const metrics = credits.buildCodebaseMetrics({
		fileCount: 69,
		contentSize: 200_000,
	});
	const quote = credits.createCreditQuote({
		userId,
		projectId,
		stage: "codebase",
		operation: "codebase_analysis",
		metrics,
	});
	const key = `p1-retry-${crypto.randomUUID()}`;
	const base = {
		userId,
		projectId,
		stage: "codebase" as const,
		operation: "codebase_analysis" as const,
		metrics,
		idempotencyKey: key,
		quote,
		analysisReference: crypto.randomUUID(),
		expiresAt: new Date(Date.now() + 600_000),
	};

	const first = await credits.reserveCreditOperation(base);
	await credits.markCreditOperationRunning({
		userId,
		operationId: first.id,
	});
	await credits.releaseCreditOperation({
		userId,
		operationId: first.id,
		reason: "persistence probe failure",
	});

	const [released] = await db
		.select()
		.from(schema.creditOperations)
		.where(eq(schema.creditOperations.id, first.id));
	assert.deepEqual(released.failure, {
		message: "persistence probe failure",
		occurredAt: released.releasedAt?.toISOString(),
		previousState: "running",
		nextState: "released",
		actor: "credit-release",
		correlationId: base.analysisReference,
	});
	await assert.rejects(
		credits.releaseCreditOperation({
			userId,
			operationId: first.id,
			reason: "duplicate",
		}),
	);
	const retried = await credits.reserveActiveCreditOperation(base);
	assert.notEqual(retried.id, first.id);
	assert.equal(retried.state, "reserved");

	const reread = await credits.getCreditOperation({
		userId,
		operationId: retried.id,
	});
	assert.equal(reread.state, "reserved");
	const [row] = await db
		.select({ state: schema.creditOperations.state })
		.from(schema.creditOperations)
		.where(eq(schema.creditOperations.id, retried.id));
	assert.equal(row.state, "reserved");
	const expired = await credits.reserveActiveCreditOperation({
		...base,
		idempotencyKey: `${key}:expiry`,
		analysisReference: crypto.randomUUID(),
		expiresAt: new Date(Date.now() - 1000),
	});
	await credits.markCreditOperationRunning({ userId, operationId: expired.id });
	await credits.reconcileExpiredCreditOperations({ userId });
	await assert.rejects(
		credits.settleCreditOperation({
			userId,
			operationId: expired.id,
			artifactId: expired.analysisReference ?? "missing",
			actualMetrics: metrics,
		}),
		/already terminal|reservation expired/,
	);
	const releasedAgain = await credits.getCreditOperation({
		userId,
		operationId: expired.id,
	});
	assert.equal(releasedAgain.state, "released");
	const debits = await db
		.select()
		.from(schema.creditLedgerEntries)
		.where(eq(schema.creditLedgerEntries.entryType, "debit"));
	assert.equal(debits.length, 0);
}, 20000);
