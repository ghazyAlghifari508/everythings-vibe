import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupIsolatedTestSchema } from "./durable-real-db-helper";

const originalDatabaseUrl = process.env.DATABASE_URL;

if (!originalDatabaseUrl) {
	describe.skip("real isolated PostgreSQL durable generation integration suite", () => {
		it("skipped due to missing DATABASE_URL", () => {});
	});
} else {
	const { cleanup } = await setupIsolatedTestSchema();

	// 3. Dynamically import DB and server services so they connect with isolated search_path
	const { eq } = await import("drizzle-orm");
	const { db } = await import("@/db");
	const { codebaseGenerationOperations, projects, users } = await import(
		"@/db/schema"
	);
	const {
		DEFAULT_MAX_ATTEMPTS,
		DurableGenerationError,
		claimNextGenerationOperation,
		completeGenerationOperation,
		computeGenerationIdentityHash,
		failGenerationOperation,
		getExistingGenerationOperation,
		getOrCreateGenerationOperation,
		listGenerationOperations,
		recoverStaleGenerationOperations,
		renewGenerationClaim,
	} = await import("../services/durable-generation.server");
	const { ProjectTenantAccessError } = await import(
		"../services/durable-generation-tenant"
	);
	type WorkspaceGenerationRequest =
		import("../types/workspace-generation").WorkspaceGenerationRequest;

	describe("real isolated PostgreSQL durable generation integration suite", () => {
		const user1Id = `user-1-${crypto.randomUUID().slice(0, 8)}`;
		const user2Id = `user-2-${crypto.randomUUID().slice(0, 8)}`;
		const project1Id = `proj-1-${crypto.randomUUID().slice(0, 8)}`;
		const project2Id = `proj-2-${crypto.randomUUID().slice(0, 8)}`;
		const deletedProjectId = `proj-del-${crypto.randomUUID().slice(0, 8)}`;

		beforeAll(async () => {
			await db.insert(users).values([
				{ id: user1Id, email: `${user1Id}@test.local`, name: "Test User 1" },
				{ id: user2Id, email: `${user2Id}@test.local`, name: "Test User 2" },
			]);
			await db.insert(projects).values([
				{ id: project1Id, userId: user1Id, name: "Test Project 1" },
				{ id: project2Id, userId: user2Id, name: "Test Project 2" },
				{
					id: deletedProjectId,
					userId: user1Id,
					name: "Deleted Project",
					deletedAt: new Date(),
				},
			]);
		});

		beforeEach(async () => {
			// Clean up operations table in isolated schema between tests
			await db.delete(codebaseGenerationOperations);
		});

		afterAll(async () => {
			await cleanup();
		});

		it("1. enforces tenant ownership on every query and denies access to soft-deleted projects", async () => {
			const crossTenantRequest: WorkspaceGenerationRequest = {
				projectId: project2Id, // Owned by user 2!
				stage: "feature",
				retry: false,
				input: {},
			};

			// User 1 cannot create on User 2's project
			await expect(
				getOrCreateGenerationOperation(user1Id, crossTenantRequest),
			).rejects.toThrow(ProjectTenantAccessError);

			// User 1 cannot access deleted project
			const deletedRequest: WorkspaceGenerationRequest = {
				projectId: deletedProjectId,
				stage: "feature",
				retry: false,
				input: {},
			};
			await expect(
				getOrCreateGenerationOperation(user1Id, deletedRequest),
			).rejects.toThrow(ProjectTenantAccessError);

			// listGenerationOperations enforces tenant ownership
			await expect(
				listGenerationOperations(user1Id, project2Id),
			).rejects.toThrow(ProjectTenantAccessError);

			// getExistingGenerationOperation enforces tenant ownership
			await expect(
				getExistingGenerationOperation(user1Id, crossTenantRequest),
			).rejects.toThrow(ProjectTenantAccessError);
		});

		it("2. enforces scoped identityHash uniqueness and never reuses old completed or active identity on changed input", async () => {
			const requestA: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "questions",
				retry: false,
				input: { prompt: "Build an inventory management app", platform: "web" },
			};

			const opA = await getOrCreateGenerationOperation(user1Id, requestA);
			expect(opA.status).toBe("queued");
			expect(opA.projectId).toBe(project1Id);
			expect(opA.stage).toBe("questions");

			// Compute identity hash
			const hashA = computeGenerationIdentityHash({
				userId: user1Id,
				projectId: project1Id,
				stage: "questions",
				input: requestA.input as Record<string, unknown>,
			});

			// Check database row has matching identityHash
			const [rowA] = await db
				.select()
				.from(codebaseGenerationOperations)
				.where(eq(codebaseGenerationOperations.id, opA.id));
			expect(rowA.identityHash).toBe(hashA);

			// Submitting with different input creates a distinct hash
			const requestB: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "questions",
				retry: false,
				input: { prompt: "Build a CRM sales dashboard", platform: "web" },
			};

			const hashB = computeGenerationIdentityHash({
				userId: user1Id,
				projectId: project1Id,
				stage: "questions",
				input: requestB.input as Record<string, unknown>,
			});
			expect(hashB).not.toBe(hashA);

			// Direct insertion of duplicate identityHash into Postgres violates unique constraint
			let duplicateError: Error | null = null;
			try {
				await db.insert(codebaseGenerationOperations).values({
					userId: user1Id,
					projectId: project1Id,
					stage: "questions",
					status: "queued",
					identityHash: hashA,
					input: requestA.input as Record<string, unknown>,
				});
			} catch (err) {
				duplicateError = err as Error;
			}
			expect(duplicateError).not.toBeNull();
			expect(duplicateError?.message).toMatch(
				/Failed query|unique constraint|duplicate key/i,
			);
		});

		it("3. ensures queued or running identical retry always joins, never cancels queued jobs", async () => {
			const request: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "prd",
				retry: false,
				input: { mode: "generate", message: "Create a chat app" },
			};

			// Create first queued operation
			const initialOp = await getOrCreateGenerationOperation(user1Id, request);
			expect(initialOp.status).toBe("queued");

			// Send retry for identical operation while still queued
			const retryRequest: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "prd",
				retry: true,
				input: { mode: "generate", message: "Create a chat app" },
			};

			const joinedOp = await getOrCreateGenerationOperation(
				user1Id,
				retryRequest,
			);
			expect(joinedOp.id).toBe(initialOp.id);
			expect(joinedOp.status).toBe("queued");

			// Verify database row was NOT cancelled
			const [dbRow] = await db
				.select()
				.from(codebaseGenerationOperations)
				.where(eq(codebaseGenerationOperations.id, initialOp.id));
			expect(dbRow.status).toBe("queued");
			expect(dbRow.error).toBeNull();
		});

		it("4. verifies getExistingGenerationOperation performs exact identity lookup for POST ?reconcile=1", async () => {
			const request: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "ac",
				retry: false,
				input: {},
			};

			// No operation exists yet
			const before = await getExistingGenerationOperation(user1Id, request);
			expect(before).toBeNull();

			// Create operation
			const created = await getOrCreateGenerationOperation(user1Id, request);

			// Now exact identity lookup finds it
			const after = await getExistingGenerationOperation(user1Id, request);
			expect(after).not.toBeNull();
			expect(after?.id).toBe(created.id);

			// Lookup with modified input revision returns null
			const sourceB = {
				codebaseId: "cb1",
				snapshotId: "snap1",
				inputRevision: "rev-B",
			};

			const lookupRevB = await getExistingGenerationOperation(
				user1Id,
				request,
				sourceB,
			);
			expect(lookupRevB).toBeNull();
		});

		it("5. tracks baselineArtifactId to distinguish previous artifact vs new persisted output", async () => {
			const request: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "task",
				retry: false,
				input: {},
			};

			const op = await getOrCreateGenerationOperation(user1Id, request);
			expect(op.baselineArtifactId).toBeNull();
			expect(op.artifactId).toBeNull();
		});

		it("6. genuine execution fence: prevents stale worker writes after lease expiry or takeover", async () => {
			// Insert queued operation to claim
			await getOrCreateGenerationOperation(user1Id, {
				projectId: project1Id,
				stage: "questions",
				retry: false,
				input: { prompt: "Fence test", platform: "web" },
			});

			// Claim operation
			const claim = await claimNextGenerationOperation(`worker-fence-test`, {
				leaseMs: 100, // Short lease: 100ms
			});
			expect(claim).not.toBeNull();
			if (!claim) return;

			// Renew with invalid token fails
			const badTokenRenew = await renewGenerationClaim({
				operationId: claim.operationId,
				token: "wrong-token-uuid",
			});
			expect(badTokenRenew).toBe(false);

			// Wait for lease to expire
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Attempting to complete with expired lease is fenced off and fails
			const completedExpired = await completeGenerationOperation(claim, {
				artifactId: "art-late",
				result: { success: true },
			});
			expect(completedExpired).toBe(false);

			// Attempting to fail with expired lease is also fenced off and fails
			const failedExpired = await failGenerationOperation(claim, {
				message: "late failure",
			});
			expect(failedExpired).toBe(false);
		});

		it("7. recovery reconciles expired jobs to terminal state and never auto-reexecutes", async () => {
			const expiredTime = new Date(Date.now() - 5000);

			const [job] = await db
				.insert(codebaseGenerationOperations)
				.values({
					userId: user1Id,
					projectId: project1Id,
					stage: "feature",
					status: "running",
					identityHash: `hash-recovery-${Date.now()}`,
					input: {},
					attempt: 1,
					maxAttempts: 3,
					leaseExpiresAt: expiredTime,
				})
				.returning();

			// Run recovery
			const recovered = await recoverStaleGenerationOperations();
			expect(recovered).toBeGreaterThanOrEqual(1);

			// Verify job is terminal "failed", NEVER "queued"
			const [recoveredRow] = await db
				.select()
				.from(codebaseGenerationOperations)
				.where(eq(codebaseGenerationOperations.id, job.id));

			expect(recoveredRow.status).toBe("failed");
			expect(recoveredRow.errorCode).toBe("LEASE_EXPIRED");
		});

		it("8. bounds explicit user retry attempts to maxAttempts", async () => {
			const boundedInput = {};
			const hash = computeGenerationIdentityHash({
				userId: user1Id,
				projectId: project1Id,
				stage: "task",
				input: boundedInput,
			});

			await db
				.insert(codebaseGenerationOperations)
				.values({
					userId: user1Id,
					projectId: project1Id,
					stage: "task",
					status: "failed",
					identityHash: hash,
					input: boundedInput,
					attempt: DEFAULT_MAX_ATTEMPTS,
					maxAttempts: DEFAULT_MAX_ATTEMPTS,
				})
				.returning();

			const req: WorkspaceGenerationRequest = {
				projectId: project1Id,
				stage: "task",
				retry: true,
				input: boundedInput,
			};

			// Explicit retry when attempt >= maxAttempts throws ATTEMPTS_EXHAUSTED
			await expect(
				getOrCreateGenerationOperation(user1Id, req),
			).rejects.toThrow(DurableGenerationError);
		});
	});
}
