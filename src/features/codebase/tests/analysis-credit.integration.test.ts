import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { cleanupPool } from "./analysis-credit-db-fixture";

test("real PostgreSQL allowance, concurrency, release, isolation, and paid accounting", async () => {
	const { db } = await import("@/db");
	const schema = await import("@/db/schema");
	const credits = await import("@/lib/services/credit-service");
	const { readInitialAnalysisAllowance } = await import(
		"../../billing/services/initial-analysis-allowance"
	);
	const { getAnalysisCreditPreflight, checkPreSyncCredit } = await import(
		"../services/analysis-credit-preflight.server"
	);
	const { eq } = await import("drizzle-orm");
	const userId = crypto.randomUUID();
	const otherUser = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	const otherProject = crypto.randomUUID();
	await db.insert(schema.users).values([
		{ id: userId, email: `${userId}@example.test`, name: "Test" },
		{ id: otherUser, email: `${otherUser}@example.test`, name: "Other" },
	]);
	await db.insert(schema.projects).values([
		{ id: projectId, userId, name: "First", projectMode: "existing_codebase" },
		{
			id: otherProject,
			userId: otherUser,
			name: "Other",
			projectMode: "existing_codebase",
		},
	]);
	await db.insert(schema.subscriptions).values([
		{
			id: crypto.randomUUID(),
			userId,
			plan: "pro",
			credits: 100,
			currentPeriodEnd: null,
		},
		{
			id: crypto.randomUUID(),
			userId: otherUser,
			plan: "pro",
			credits: 0,
			currentPeriodEnd: null,
		},
	]);
	assert.equal((await checkPreSyncCredit(otherUser, {})).response?.status, 403);
	assert.equal(
		(
			await checkPreSyncCredit(otherUser, {
				acceptAnalysisPolicy: true,
				creditConsent: { maximumCredits: 0, pricingVersion: "adaptive-v1" },
			})
		).response,
		null,
	);
	const metrics = credits.buildCodebaseMetrics({
		fileCount: 100,
		contentSize: 250000,
	});
	const quote = credits.createCreditQuote({
		userId,
		projectId,
		stage: "codebase",
		operation: "codebase_analysis",
		metrics,
	});
	const input = {
		userId,
		projectId,
		stage: "codebase" as const,
		operation: "codebase_analysis" as const,
		metrics,
		quote,
		idempotencyKey: "initial",
		initialAnalysisAllowance: true,
		expiresAt: new Date(Date.now() + 600000),
	};
	assert.equal(
		(await getAnalysisCreditPreflight(otherUser)).code,
		"FREE_ALLOWANCE_AVAILABLE",
	);
	assert.equal(
		(await getAnalysisCreditPreflight(otherUser)).code,
		"FREE_ALLOWANCE_AVAILABLE",
	);
	const concurrent = await Promise.all([
		credits.reserveCreditOperation(input),
		credits.reserveCreditOperation(input),
	]);
	assert.equal(concurrent[0].id, concurrent[1].id);
	assert.equal(
		(await readInitialAnalysisAllowance(db, userId)).inProgress,
		true,
	);
	await assert.rejects(
		credits.reserveCreditOperation({
			...input,
			idempotencyKey: "duplicate-repository",
		}),
	);
	await assert.rejects(
		credits.reserveCreditOperation({
			...input,
			userId: otherUser,
			idempotencyKey: "cross-user",
		}),
	);
	const running = await Promise.allSettled(
		concurrent.map((operation) =>
			credits.markCreditOperationRunning({ userId, operationId: operation.id }),
		),
	);
	assert.equal(
		running.filter((result) => result.status === "fulfilled").length,
		1,
	);
	await credits.releaseCreditOperation({
		userId,
		operationId: concurrent[0].id,
		reason: "provider failure",
	});
	assert.equal((await readInitialAnalysisAllowance(db, userId)).used, false);
	const retry = await credits.reserveCreditOperation({
		...input,
		idempotencyKey: "initial-retry",
	});
	await credits.markCreditOperationRunning({ userId, operationId: retry.id });
	await credits.settleCreditOperation({
		userId,
		operationId: retry.id,
		artifactId: "analysis-result",
		actualMetrics: metrics,
	});
	assert.equal((await readInitialAnalysisAllowance(db, userId)).used, true);
	const [freeSub] = await db
		.select()
		.from(schema.subscriptions)
		.where(eq(schema.subscriptions.userId, userId));
	assert.equal(freeSub.creditsUsed, 0);
	assert.equal(freeSub.creditsReserved, 0);
	await assert.rejects(
		credits.reserveCreditOperation({
			...input,
			idempotencyKey: "rename-bypass",
		}),
	);
	assert.equal((await getAnalysisCreditPreflight(userId)).canStart, false);
	assert.equal(
		(
			await getAnalysisCreditPreflight(userId, {
				consent: { maximumCredits: 1, pricingVersion: quote.pricingVersion },
			})
		).canStart,
		false,
	);
	assert.equal(
		(
			await getAnalysisCreditPreflight(userId, {
				consent: {
					maximumCredits: quote.maximumCredits,
					pricingVersion: quote.pricingVersion,
				},
			})
		).canStart,
		true,
	);
	const paid = await Promise.all([
		credits.reserveCreditOperation({
			...input,
			initialAnalysisAllowance: false,
			idempotencyKey: "paid",
		}),
		credits.reserveCreditOperation({
			...input,
			initialAnalysisAllowance: false,
			idempotencyKey: "paid",
		}),
	]);
	assert.equal(paid[0].id, paid[1].id);
	await credits.markCreditOperationRunning({ userId, operationId: paid[0].id });
	await credits.settleCreditOperation({
		userId,
		operationId: paid[0].id,
		artifactId: "paid-analysis",
		actualMetrics: metrics,
	});
	assert.equal(
		(
			await credits.reserveCreditOperation({
				...input,
				initialAnalysisAllowance: false,
				idempotencyKey: "paid",
			})
		).state,
		"settled",
	);
	await assert.rejects(
		credits.settleCreditOperation({
			userId,
			operationId: paid[0].id,
			artifactId: "paid-analysis",
			actualMetrics: metrics,
		}),
	);
	const [paidSub] = await db
		.select()
		.from(schema.subscriptions)
		.where(eq(schema.subscriptions.userId, userId));
	assert.equal(paidSub.creditsUsed, quote.estimatedCredits);
	assert.equal(paidSub.creditsReserved, 0);
	const expired = await credits.reserveCreditOperation({
		...input,
		initialAnalysisAllowance: false,
		idempotencyKey: "timeout",
		expiresAt: new Date(Date.now() - 1000),
	});
	await credits.reconcileExpiredCreditOperations({ userId });
	const [expiredOperation] = await db
		.select()
		.from(schema.creditOperations)
		.where(eq(schema.creditOperations.id, expired.id));
	assert.equal(expiredOperation.state, "released");
	const failedPaid = await credits.reserveCreditOperation({
		...input,
		initialAnalysisAllowance: false,
		idempotencyKey: "failed-paid",
	});
	await credits.markCreditOperationRunning({
		userId,
		operationId: failedPaid.id,
	});
	await credits.releaseCreditOperation({
		userId,
		operationId: failedPaid.id,
		reason: "provider unavailable",
	});
	const [releasedSub] = await db
		.select()
		.from(schema.subscriptions)
		.where(eq(schema.subscriptions.userId, userId));
	assert.equal(releasedSub.creditsUsed, quote.estimatedCredits);
	assert.equal(releasedSub.creditsReserved, 0);
	const debitRows = await db
		.select()
		.from(schema.creditLedgerEntries)
		.where(eq(schema.creditLedgerEntries.entryType, "debit"));
	assert.equal(debitRows.length, 1);
	assert.equal(debitRows[0].amount, -quote.estimatedCredits);
	assert.equal((await readInitialAnalysisAllowance(db, otherUser)).used, false);
	const zeroCredit = await credits.reserveCreditOperation({
		...input,
		userId: otherUser,
		projectId: otherProject,
		idempotencyKey: "zero-credit",
		analysisReference: "expired-analysis",
		expiresAt: new Date(Date.now() - 1000),
	});
	await db.insert(schema.codebaseAnalyses).values({
		id: "expired-analysis",
		projectId: otherProject,
		snapshotId: "test-snapshot",
		status: "pending",
	});
	await credits.reconcileExpiredCreditOperations({ userId: otherUser });
	const [expiredAnalysis] = await db
		.select()
		.from(schema.codebaseAnalyses)
		.where(eq(schema.codebaseAnalyses.id, "expired-analysis"));
	assert.equal(expiredAnalysis.status, "failed");
	assert.equal((await readInitialAnalysisAllowance(db, otherUser)).used, false);
	await assert.rejects(
		credits.settleCreditOperation({
			userId: otherUser,
			operationId: zeroCredit.id,
			artifactId: "late",
			actualMetrics: metrics,
		}),
	);
	const fresh = await credits.reserveCreditOperation({
		...input,
		userId: otherUser,
		projectId: otherProject,
		idempotencyKey: "after-timeout",
	});
	await assert.rejects(
		db.transaction(async (tx) => {
			await credits.settleCreditOperation(
				{
					userId: otherUser,
					operationId: fresh.id,
					artifactId: "rolled-back",
					actualMetrics: metrics,
				},
				tx,
			);
			throw new Error("artifact persistence failure");
		}),
	);
	assert.equal((await readInitialAnalysisAllowance(db, otherUser)).used, false);
	const [unsettled] = await db
		.select()
		.from(schema.creditOperations)
		.where(eq(schema.creditOperations.id, fresh.id));
	assert.equal(unsettled.state, "reserved");
	await credits.releaseCreditOperation({
		userId: otherUser,
		operationId: fresh.id,
		reason: "artifact failure",
	});
	await db
		.update(schema.users)
		.set({ initialAnalysisUsedAt: new Date() })
		.where(eq(schema.users.id, otherUser));
	assert.equal(
		(await getAnalysisCreditPreflight(otherUser)).code,
		"INSUFFICIENT_CREDITS",
	);
	await db
		.update(schema.subscriptions)
		.set({ currentPeriodEnd: new Date(Date.now() - 1000), credits: 100 })
		.where(eq(schema.subscriptions.userId, otherUser));
	assert.equal(
		(await getAnalysisCreditPreflight(otherUser)).code,
		"SUBSCRIPTION_PAUSED",
	);
	await assert.rejects(
		credits.reserveCreditOperation({
			...input,
			userId: otherUser,
			projectId: otherProject,
			idempotencyKey: "paused",
			initialAnalysisAllowance: false,
		}),
	);
	const legacyUser = crypto.randomUUID();
	const legacyProject = crypto.randomUUID();
	await db.insert(schema.users).values({
		id: legacyUser,
		email: `${legacyUser}@example.test`,
		name: "Legacy",
	});
	await db.insert(schema.projects).values({
		id: legacyProject,
		userId: legacyUser,
		name: "Legacy",
		projectMode: "existing_codebase",
	});
	await db.insert(schema.codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId: legacyProject,
		snapshotId: "legacy-snapshot",
		status: "ready",
	});
	await cleanupPool?.query(
		await readFile("drizzle/0040_initial_analysis_allowance.sql", "utf8"),
	);
	await db
		.delete(schema.codebaseAnalyses)
		.where(eq(schema.codebaseAnalyses.projectId, legacyProject));
	assert.equal((await readInitialAnalysisAllowance(db, legacyUser)).used, true);
}, 20000);
