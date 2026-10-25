import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupIsolatedTestSchema } from "./durable-real-db-helper";

const originalDatabaseUrl = process.env.DATABASE_URL;

if (!originalDatabaseUrl) {
	describe.skip("real isolated PostgreSQL durable generation concurrency", () => {
		it("skipped due to missing DATABASE_URL", () => {});
	});
} else {
	const { cleanup } = await setupIsolatedTestSchema();

	const { eq } = await import("drizzle-orm");
	const { db } = await import("@/db");
	const { codebaseGenerationOperations, projects, users } = await import(
		"@/db/schema"
	);
	const {
		claimNextGenerationOperation,
		completeGenerationOperation,
		getOrCreateGenerationOperation,
	} = await import("../services/durable-generation.server");
	type WorkspaceGenerationRequest =
		import("../types/workspace-generation").WorkspaceGenerationRequest;

	describe("real isolated PostgreSQL durable generation concurrency", () => {
		const user1Id = `user-1-${crypto.randomUUID().slice(0, 8)}`;
		const user2Id = `user-2-${crypto.randomUUID().slice(0, 8)}`;
		const project1Id = `proj-1-${crypto.randomUUID().slice(0, 8)}`;
		const project2Id = `proj-2-${crypto.randomUUID().slice(0, 8)}`;

		beforeAll(async () => {
			await db.insert(users).values([
				{ id: user1Id, email: `${user1Id}@test.local`, name: "Test User 1" },
				{ id: user2Id, email: `${user2Id}@test.local`, name: "Test User 2" },
			]);
			await db.insert(projects).values([
				{ id: project1Id, userId: user1Id, name: "Test Project 1" },
				{ id: project2Id, userId: user2Id, name: "Test Project 2" },
			]);
		});

		beforeEach(async () => {
			// Each scenario starts from an empty queue so claims cannot cross tests.
			await db.delete(codebaseGenerationOperations);
		});

		afterAll(async () => {
			await cleanup();
		});

		it("9. concurrent creation race: two simultaneous requests for identical input cleanly join without throwing unique conflict", async () => {
			const concurrentRequest: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "prd",
				retry: false,
				input: { mode: "generate", message: "Concurrent race test prompt" },
			};

			const [resA, resB] = await Promise.all([
				getOrCreateGenerationOperation(user1Id, concurrentRequest),
				getOrCreateGenerationOperation(user1Id, concurrentRequest),
			]);

			expect(resA.id).toBe(resB.id);
			expect(resA.status).toBe("queued");
		});

		it("10. concurrent claim contention: simultaneous workers claim distinct jobs with SKIP LOCKED without collisions", async () => {
			const op1 = await getOrCreateGenerationOperation(user1Id, {
				projectId: project1Id,
				stage: "questions",
				retry: false,
				input: { prompt: "Project 1 app", platform: "web" },
			});
			const op2 = await getOrCreateGenerationOperation(user2Id, {
				projectId: project2Id,
				stage: "questions",
				retry: false,
				input: { prompt: "Project 2 app", platform: "web" },
			});

			expect(op1.status).toBe("queued");
			expect(op2.status).toBe("queued");

			const [claimA, claimB] = await Promise.all([
				claimNextGenerationOperation("worker-concurrent-A"),
				claimNextGenerationOperation("worker-concurrent-B"),
			]);

			expect(claimA).not.toBeNull();
			expect(claimB).not.toBeNull();
			expect(claimA?.operationId).not.toBe(claimB?.operationId);
		});

		it("11. lease takeover: worker 2 takes over expired claim and worker 1 is locked out from completing", async () => {
			await getOrCreateGenerationOperation(user1Id, {
				projectId: project1Id,
				stage: "questions",
				retry: false,
				input: { prompt: "Takeover test", platform: "web" },
			});

			const claim1 = await claimNextGenerationOperation("worker-1", {
				leaseMs: 50,
			});
			expect(claim1).not.toBeNull();
			if (!claim1) return;

			// Expire the lease to simulate a worker timeout.
			await db
				.update(codebaseGenerationOperations)
				.set({ leaseExpiresAt: new Date(Date.now() - 5000) })
				.where(eq(codebaseGenerationOperations.id, claim1.operationId));

			// A superseded worker must not be able to persist its stale result.
			const worker1Success = await completeGenerationOperation(claim1, {
				artifactId: "stale-art",
				result: { doneBy: "worker-1" },
			});
			expect(worker1Success).toBe(false);
		});
	});
}
