import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
import "./analysis-credit-db-fixture";

test("validated analysis commits READY with settlement and rolls both back on persistence failure", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const c = await import("@/lib/services/credit-service");
	const { requestCodebaseAnalysis } = await import(
		"../services/analysis.server"
	);
	const { codebaseAnalysisSchema } = await import(
		"../services/analysis-schema"
	);
	const userId = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();
	const snapshotId = crypto.randomUUID();
	await db
		.insert(s.users)
		.values({ id: userId, email: `${userId}@example.test`, name: "Test" });
	await db.insert(s.projects).values({
		id: projectId,
		userId,
		name: "Add reporting",
		projectMode: "existing_codebase",
	});
	await db
		.insert(s.subscriptions)
		.values({ id: crypto.randomUUID(), userId, plan: "pro", credits: 100 });
	await db.insert(s.codebaseSyncSessions).values({
		id: sessionId,
		projectId,
		userId,
		credentialHash: "synthetic",
		status: "uploaded",
		expiresAt: new Date(Date.now() + 600000),
	});
	await db.insert(s.codebaseSnapshots).values({
		id: snapshotId,
		projectId,
		syncSessionId: sessionId,
		status: "uploaded",
		manifest: [],
	});
	const metrics = c.buildCodebaseMetrics({ fileCount: 0, contentSize: 0 });
	const quote = c.createCreditQuote({
		userId,
		projectId,
		stage: "codebase",
		operation: "codebase_analysis",
		metrics,
	});
	const payload = JSON.stringify({
		framework: "Unknown",
		language: "Unknown",
		starterSuggestions: ["feature", "bugfix", "refactor", "ui"].map((id) => ({
			id,
			title: `Task ${id}`,
			description: "Inspect existing behavior",
			prompt: "Inspect repository evidence before implementing the task.",
			relevantPaths: [],
		})),
	});
	async function attempt(fail: boolean) {
		const analysisId = crypto.randomUUID();
		const operation = await c.reserveActiveCreditOperation({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			quote,
			idempotencyKey: `${projectId}:analysis`,
			analysisReference: analysisId,
			expiresAt: new Date(Date.now() + 600000),
		});
		await c.markCreditOperationRunning({ userId, operationId: operation.id });
		await assert.rejects(
			c.settleCreditOperation({
				userId,
				operationId: operation.id,
				artifactId: crypto.randomUUID(),
				actualMetrics: metrics,
			}),
			/Analysis reservation identity mismatch/,
		);
		const result = requestCodebaseAnalysis(projectId, snapshotId, {
			analysisId,
			generate: async () => {
				const swept = await c.reconcileExpiredCreditOperations({ userId });
				assert.deepEqual(swept.releasedOperationIds, []);
				await assert.rejects(
					requestCodebaseAnalysis(projectId, snapshotId, {
						generate: async () => {
							throw new Error("duplicate generation must not execute");
						},
					}),
					(error: unknown) =>
						error instanceof Error &&
						"code" in error &&
						error.code === "SNAPSHOT_NOT_UPLOADED",
				);
				return payload;
			},
			settle: async (tx, id) => {
				await c.settleCreditOperation(
					{
						userId,
						operationId: operation.id,
						artifactId: id,
						actualMetrics: metrics,
					},
					tx,
				);
				if (fail) throw new Error("synthetic persistence failure");
			},
		});
		if (fail) {
			await assert.rejects(result);
			const [op] = await db
				.select()
				.from(s.creditOperations)
				.where(eq(s.creditOperations.id, operation.id));
			assert.equal(op.state, "running");
			const [sub] = await db
				.select()
				.from(s.subscriptions)
				.where(eq(s.subscriptions.userId, userId));
			assert.equal(sub.creditsUsed, 0);
			await c.releaseCreditOperation({
				userId,
				operationId: operation.id,
				reason: "test failure",
			});
		} else {
			const [completed, sweep] = await Promise.all([
				result,
				c.reconcileExpiredCreditOperations({ userId }),
			]);
			assert.deepEqual(sweep.releasedOperationIds, []);
			assert.equal(completed.id, analysisId);
			const [op] = await db
				.select()
				.from(s.creditOperations)
				.where(eq(s.creditOperations.id, operation.id));
			assert.equal(op.state, "settled");
			assert.equal(op.artifactReference, analysisId);
		}
		const [analysis] = await db
			.select()
			.from(s.codebaseAnalyses)
			.where(eq(s.codebaseAnalyses.id, analysisId));
		assert.equal(analysis.status, fail ? "failed" : "ready");
		assert.equal(analysis.snapshotId, snapshotId);
		if (!fail) {
			const parsed = codebaseAnalysisSchema.parse(analysis.output);
			assert.equal(parsed.projectId, projectId);
			assert.equal(parsed.snapshotId, snapshotId);
		} else assert.equal(analysis.output, null);
	}
	await attempt(true);
	await attempt(false);
	const [snapshot] = await db
		.select()
		.from(s.codebaseSnapshots)
		.where(eq(s.codebaseSnapshots.id, snapshotId));
	assert.equal(snapshot.status, "uploaded");
	const debits = await db
		.select()
		.from(s.creditLedgerEntries)
		.where(eq(s.creditLedgerEntries.entryType, "debit"));
	assert.equal(debits.length, 1);
}, 20000);
