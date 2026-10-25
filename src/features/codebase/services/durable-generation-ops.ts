import crypto from "node:crypto";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { codebaseGenerationOperations, projects } from "@/db/schema";
import type {
	DurableGenerationClaim,
	WorkspaceGenerationExecutionResult,
} from "../types/durable-generation";
import type { WorkspaceGenerationOperation } from "../types/workspace-generation";
import { acquireProjectAdvisoryXactLock } from "./durable-generation-fence";
import { assertProjectTenantAccess } from "./durable-generation-tenant";

export const DEFAULT_LEASE_MS = 60_000;
export const DEFAULT_HEARTBEAT_MS = 15_000;
export const DEFAULT_EXECUTION_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export function toWorkspaceGenerationOperation(
	row: typeof codebaseGenerationOperations.$inferSelect,
): WorkspaceGenerationOperation {
	return {
		id: row.id,
		projectId: row.projectId,
		stage: row.stage,
		status: row.status,
		attempt: row.attempt,
		result: row.result,
		error: row.error,
		errorCode: row.errorCode,
		baselineArtifactId: row.baselineArtifactId ?? null,
		artifactId: row.artifactId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		startedAt: row.startedAt?.toISOString() ?? null,
		finishedAt: row.finishedAt?.toISOString() ?? null,
	};
}

export async function claimNextGenerationOperation(
	workerId = `worker-${process.pid}`,
	options: { leaseMs?: number } = {},
): Promise<DurableGenerationClaim | null> {
	const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
	const now = new Date();
	const leaseExpiresAt = new Date(Date.now() + leaseMs);

	return db.transaction(async (tx) => {
		const candidates = await tx
			.select()
			.from(codebaseGenerationOperations)
			.where(
				and(
					// Claim queued jobs ONLY; expired running jobs must be reconciled by recovery first
					eq(codebaseGenerationOperations.status, "queued"),
					// Ensure project exists, belongs to tenant, and is not deleted
					sql`EXISTS (
						SELECT 1 FROM ${projects} AS p
						WHERE p.id = ${codebaseGenerationOperations.projectId}
						  AND p.user_id = ${codebaseGenerationOperations.userId}
						  AND p.deleted_at IS NULL
					)`,
					// Cross-stage serialization: No other operation for same project is actively running with valid lease
					sql`NOT EXISTS (
						SELECT 1 FROM ${codebaseGenerationOperations} AS running_op
						WHERE running_op.project_id = ${codebaseGenerationOperations.projectId}
						  AND running_op.id != ${codebaseGenerationOperations.id}
						  AND running_op.status = 'running'
						  AND running_op.lease_expires_at > ${now}
					)`,
				),
			)
			.orderBy(asc(codebaseGenerationOperations.createdAt))
			.limit(1)
			.for("update", { skipLocked: true });

		const row = candidates[0];
		if (!row) return null;

		// Acquire transaction-scoped advisory lock for this project to coordinate claim
		const locked = await acquireProjectAdvisoryXactLock(tx, row.projectId);
		if (!locked) return null;

		if (row.attempt >= row.maxAttempts) {
			await tx
				.update(codebaseGenerationOperations)
				.set({
					status: "failed",
					error: "Operation exceeded maximum execution attempts.",
					errorCode: "MAX_ATTEMPTS_EXCEEDED",
					jobToken: null,
					leaseExpiresAt: null,
					finishedAt: now,
					updatedAt: now,
				})
				.where(eq(codebaseGenerationOperations.id, row.id));
			return null;
		}

		const token = crypto.randomUUID();
		const nextAttempt = row.attempt + 1;

		await tx
			.update(codebaseGenerationOperations)
			.set({
				status: "running",
				jobToken: token,
				claimedBy: workerId,
				attempt: nextAttempt,
				leaseExpiresAt,
				heartbeatAt: now,
				startedAt: row.startedAt ?? now,
				updatedAt: now,
			})
			.where(eq(codebaseGenerationOperations.id, row.id));

		const controller = new AbortController();
		return {
			operationId: row.id,
			userId: row.userId,
			projectId: row.projectId,
			stage: row.stage,
			token,
			attempt: nextAttempt,
			input: row.input,
			source: row.source,
			baselineArtifactId: row.baselineArtifactId,
			signal: controller.signal,
		};
	});
}

export async function renewGenerationClaim(
	claim: { operationId: string; token: string },
	options: { leaseMs?: number } = {},
): Promise<boolean> {
	const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
	const now = new Date();
	const leaseExpiresAt = new Date(Date.now() + leaseMs);

	const updated = await db
		.update(codebaseGenerationOperations)
		.set({
			leaseExpiresAt,
			heartbeatAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(codebaseGenerationOperations.id, claim.operationId),
				eq(codebaseGenerationOperations.jobToken, claim.token),
				eq(codebaseGenerationOperations.status, "running"),
				gt(codebaseGenerationOperations.leaseExpiresAt, now),
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	return updated.length > 0;
}

export const heartbeatGenerationClaim = renewGenerationClaim;

export async function completeGenerationOperation(
	claim: { operationId: string; token: string },
	outcome: WorkspaceGenerationExecutionResult,
): Promise<boolean> {
	// Rejection gate: Must provide valid persisted artifactId and result
	if (!outcome || !outcome.artifactId || !outcome.result) {
		return false;
	}

	const now = new Date();
	const updated = await db
		.update(codebaseGenerationOperations)
		.set({
			status: "completed",
			artifactId: outcome.artifactId,
			result: outcome.result,
			error: null,
			errorCode: null,
			jobToken: null,
			leaseExpiresAt: null,
			finishedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(codebaseGenerationOperations.id, claim.operationId),
				eq(codebaseGenerationOperations.jobToken, claim.token),
				eq(codebaseGenerationOperations.status, "running"),
				gt(codebaseGenerationOperations.leaseExpiresAt, now),
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	return updated.length > 0;
}

export async function failGenerationOperation(
	claim: { operationId: string; token: string },
	error: { message: string; code?: string },
): Promise<boolean> {
	const now = new Date();
	const updated = await db
		.update(codebaseGenerationOperations)
		.set({
			status: "failed",
			error: error.message,
			errorCode: error.code ?? "EXECUTION_FAILED",
			jobToken: null,
			leaseExpiresAt: null,
			finishedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(codebaseGenerationOperations.id, claim.operationId),
				eq(codebaseGenerationOperations.jobToken, claim.token),
				eq(codebaseGenerationOperations.status, "running"),
				gt(codebaseGenerationOperations.leaseExpiresAt, now),
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	return updated.length > 0;
}

export async function cancelGenerationOperation(
	userId: string,
	operationId: string,
): Promise<boolean> {
	const [operation] = await db
		.select({ projectId: codebaseGenerationOperations.projectId })
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.id, operationId),
				eq(codebaseGenerationOperations.userId, userId),
			),
		)
		.limit(1);

	if (!operation) return false;

	await assertProjectTenantAccess(userId, operation.projectId);

	const now = new Date();
	const updated = await db
		.update(codebaseGenerationOperations)
		.set({
			status: "cancelled",
			error: "Cancelled by user",
			errorCode: "CANCELLED",
			jobToken: null,
			leaseExpiresAt: null,
			finishedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(codebaseGenerationOperations.id, operationId),
				eq(codebaseGenerationOperations.userId, userId),
				eq(codebaseGenerationOperations.status, "queued"),
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	return updated.length > 0;
}
