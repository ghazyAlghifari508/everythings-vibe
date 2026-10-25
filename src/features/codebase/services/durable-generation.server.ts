import crypto from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { codebaseGenerationOperations } from "@/db/schema";
import type {
	DurableExecutionOptions,
	DurableGenerationClaim,
	DurableGenerationSource,
	WorkspaceGenerationExecutionResult,
	WorkspaceGenerationExecutor,
	WorkspaceGenerationStage,
} from "../types/durable-generation";
import type {
	WorkspaceGenerationOperation,
	WorkspaceGenerationRequest,
} from "../types/workspace-generation";
import type { CodebaseRunStage } from "./chat-flow-run";
import { readWorkspaceGenerationArtifact } from "./workspace-generation-artifact.server";

export const DEFAULT_LEASE_MS = 60_000;
export const DEFAULT_HEARTBEAT_MS = 15_000;
export const DEFAULT_EXECUTION_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

function canonicalStringify(obj: unknown): string {
	if (obj === null || typeof obj !== "object") {
		return JSON.stringify(obj);
	}
	if (Array.isArray(obj)) {
		return `[${obj.map(canonicalStringify).join(",")}]`;
	}
	const keys = Object.keys(obj as Record<string, unknown>).sort();
	return `{${keys
		.map(
			(k) =>
				`${JSON.stringify(k)}:${canonicalStringify(
					(obj as Record<string, unknown>)[k],
				)}`,
		)
		.join(",")}}`;
}

export function computeGenerationIdentityHash(params: {
	userId: string;
	projectId: string;
	stage: string;
	inputRevision?: string | null;
	input: Record<string, unknown>;
}): string {
	const hash = crypto.createHash("sha256");
	hash.update(params.userId);
	hash.update(":");
	hash.update(params.projectId);
	hash.update(":");
	hash.update(params.stage);
	hash.update(":");
	hash.update(params.inputRevision ?? "");
	hash.update(":");
	hash.update(canonicalStringify(params.input));
	return hash.digest("hex");
}

export function toWorkspaceGenerationOperation(
	row: typeof codebaseGenerationOperations.$inferSelect,
): WorkspaceGenerationOperation {
	return {
		id: row.id,
		projectId: row.projectId,
		stage: row.stage as WorkspaceGenerationStage,
		status: row.status as WorkspaceGenerationOperation["status"],
		attempt: row.attempt,
		result: row.result,
		error: row.error,
		errorCode: row.errorCode,
		artifactId: row.artifactId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		startedAt: row.startedAt?.toISOString() ?? null,
		finishedAt: row.finishedAt?.toISOString() ?? null,
	};
}

export async function getOrCreateGenerationOperation(
	userId: string,
	request: WorkspaceGenerationRequest,
	source?: DurableGenerationSource,
): Promise<WorkspaceGenerationOperation> {
	const stage = request.stage as WorkspaceGenerationStage;
	const identityHash = computeGenerationIdentityHash({
		userId,
		projectId: request.projectId,
		stage,
		inputRevision: source?.inputRevision,
		input: request.input as Record<string, unknown>,
	});
	const now = new Date();

	// 1. Artifact reconcile: Check if persisted evidence already exists
	if (!request.retry) {
		const artifact = await readWorkspaceGenerationArtifact(
			userId,
			request.projectId,
			stage as CodebaseRunStage,
		).catch(() => null);

		if (artifact) {
			const [existingCompleted] = await db
				.select()
				.from(codebaseGenerationOperations)
				.where(
					and(
						eq(codebaseGenerationOperations.projectId, request.projectId),
						eq(codebaseGenerationOperations.stage, stage),
						eq(codebaseGenerationOperations.status, "completed"),
					),
				)
				.orderBy(desc(codebaseGenerationOperations.createdAt))
				.limit(1);

			if (existingCompleted) {
				return toWorkspaceGenerationOperation(existingCompleted);
			}

			// Create a synthetic completed record for existing artifact
			const [created] = await db
				.insert(codebaseGenerationOperations)
				.values({
					userId,
					projectId: request.projectId,
					stage,
					status: "completed",
					identityHash,
					input: request.input as Record<string, unknown>,
					source: source ?? null,
					artifactId: artifact.artifactId,
					result: artifact.result,
					attempt: 1,
					maxAttempts: DEFAULT_MAX_ATTEMPTS,
					startedAt: now,
					finishedAt: now,
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			if (created) {
				return toWorkspaceGenerationOperation(created);
			}
		}
	}

	// 2. Check for active (queued or running) operations on this project & stage
	const [activeOp] = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.projectId, request.projectId),
				eq(codebaseGenerationOperations.stage, stage),
				inArray(codebaseGenerationOperations.status, ["queued", "running"]),
			),
		)
		.limit(1);

	if (activeOp) {
		const isLeaseExpired =
			activeOp.status === "running" &&
			activeOp.leaseExpiresAt &&
			activeOp.leaseExpiresAt <= now;

		if (isLeaseExpired && activeOp.attempt >= activeOp.maxAttempts) {
			// Abandoned operation reached max attempts, mark failed
			await db
				.update(codebaseGenerationOperations)
				.set({
					status: "failed",
					error: "Operation timed out and exceeded maximum attempts",
					errorCode: "MAX_ATTEMPTS_EXCEEDED",
					jobToken: null,
					leaseExpiresAt: null,
					finishedAt: now,
					updatedAt: now,
				})
				.where(eq(codebaseGenerationOperations.id, activeOp.id));
			// Fall through to enqueue a new operation
		} else if (!request.retry) {
			// Stable reuse of in-flight operation
			return toWorkspaceGenerationOperation(activeOp);
		} else {
			// Retry requested: if it's currently actively running with valid lease, do not duplicate
			if (
				activeOp.status === "running" &&
				activeOp.leaseExpiresAt &&
				activeOp.leaseExpiresAt > now
			) {
				return toWorkspaceGenerationOperation(activeOp);
			}
			// Otherwise cancel the stale or queued operation so a fresh attempt can be inserted
			await db
				.update(codebaseGenerationOperations)
				.set({
					status: "cancelled",
					error: "Superseded by retry request",
					errorCode: "CANCELLED_BY_RETRY",
					finishedAt: now,
					updatedAt: now,
				})
				.where(eq(codebaseGenerationOperations.id, activeOp.id));
		}
	}

	// 3. Check for identical completed operation
	if (!request.retry) {
		const [identicalCompleted] = await db
			.select()
			.from(codebaseGenerationOperations)
			.where(
				and(
					eq(codebaseGenerationOperations.userId, userId),
					eq(codebaseGenerationOperations.identityHash, identityHash),
					eq(codebaseGenerationOperations.status, "completed"),
				),
			)
			.limit(1);

		if (identicalCompleted) {
			return toWorkspaceGenerationOperation(identicalCompleted);
		}
	}

	// 4. Atomic create with unique constraint conflict handling
	try {
		const [inserted] = await db
			.insert(codebaseGenerationOperations)
			.values({
				userId,
				projectId: request.projectId,
				stage,
				status: "queued",
				identityHash,
				input: request.input as Record<string, unknown>,
				source: source ?? null,
				attempt: 0,
				maxAttempts: DEFAULT_MAX_ATTEMPTS,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		return toWorkspaceGenerationOperation(inserted);
	} catch (error) {
		// On concurrent insert race against partial unique index, reuse the winning active operation
		const [winner] = await db
			.select()
			.from(codebaseGenerationOperations)
			.where(
				and(
					eq(codebaseGenerationOperations.projectId, request.projectId),
					eq(codebaseGenerationOperations.stage, stage),
					inArray(codebaseGenerationOperations.status, ["queued", "running"]),
				),
			)
			.limit(1);

		if (winner) {
			return toWorkspaceGenerationOperation(winner);
		}
		throw error;
	}
}

export async function listGenerationOperations(
	userId: string,
	projectId: string,
): Promise<WorkspaceGenerationOperation[]> {
	const rows = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.userId, userId),
				eq(codebaseGenerationOperations.projectId, projectId),
			),
		)
		.orderBy(desc(codebaseGenerationOperations.createdAt));

	return rows.map(toWorkspaceGenerationOperation);
}

export async function getGenerationOperation(
	userId: string,
	operationId: string,
): Promise<WorkspaceGenerationOperation | null> {
	const [row] = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.id, operationId),
				eq(codebaseGenerationOperations.userId, userId),
			),
		)
		.limit(1);

	return row ? toWorkspaceGenerationOperation(row) : null;
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
					or(
						eq(codebaseGenerationOperations.status, "queued"),
						and(
							eq(codebaseGenerationOperations.status, "running"),
							lte(codebaseGenerationOperations.leaseExpiresAt, now),
						),
					),
					// Cross-stage serialization: No other operation for same project is actively running
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
			stage: row.stage as WorkspaceGenerationStage,
			token,
			attempt: nextAttempt,
			input: row.input,
			source: row.source,
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
	const now = new Date();
	const updated = await db
		.update(codebaseGenerationOperations)
		.set({
			status: "completed",
			artifactId: outcome.artifactId ?? null,
			result: outcome.result ?? null,
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
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	return updated.length > 0;
}

export async function cancelGenerationOperation(
	userId: string,
	operationId: string,
): Promise<boolean> {
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
				inArray(codebaseGenerationOperations.status, ["queued", "running"]),
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	return updated.length > 0;
}

export async function recoverStaleGenerationOperations(
	_options: { leaseMs?: number } = {},
): Promise<number> {
	const now = new Date();
	let recoveredCount = 0;

	// 1. Mark exhausted attempts as failed
	const failed = await db
		.update(codebaseGenerationOperations)
		.set({
			status: "failed",
			error: "Operation timed out and exceeded maximum attempts",
			errorCode: "WORKER_TIMEOUT",
			jobToken: null,
			leaseExpiresAt: null,
			finishedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(codebaseGenerationOperations.status, "running"),
				lte(codebaseGenerationOperations.leaseExpiresAt, now),
				sql`${codebaseGenerationOperations.attempt} >= ${codebaseGenerationOperations.maxAttempts}`,
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	recoveredCount += failed.length;

	// 2. Re-queue eligible stale operations
	const requeued = await db
		.update(codebaseGenerationOperations)
		.set({
			status: "queued",
			jobToken: null,
			leaseExpiresAt: null,
			updatedAt: now,
		})
		.where(
			and(
				eq(codebaseGenerationOperations.status, "running"),
				lte(codebaseGenerationOperations.leaseExpiresAt, now),
				sql`${codebaseGenerationOperations.attempt} < ${codebaseGenerationOperations.maxAttempts}`,
			),
		)
		.returning({ id: codebaseGenerationOperations.id });

	recoveredCount += requeued.length;
	return recoveredCount;
}

export async function executeGenerationOperationBounded(
	claim: DurableGenerationClaim,
	executor: WorkspaceGenerationExecutor,
	options: DurableExecutionOptions = {},
): Promise<WorkspaceGenerationOperation> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
	const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
	const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;

	const controller = new AbortController();
	let leaseLost = false;

	const timeoutTimer = setTimeout(() => {
		controller.abort(new Error("Operation execution timeout exceeded"));
	}, timeoutMs);

	const heartbeatTimer = setInterval(async () => {
		if (leaseLost) return;
		try {
			const renewed = await renewGenerationClaim(claim, { leaseMs });
			if (!renewed) {
				leaseLost = true;
				controller.abort(new Error("Generation lease lost or superseded"));
			}
		} catch {
			leaseLost = true;
			controller.abort(new Error("Generation heartbeat communication failed"));
		}
	}, heartbeatMs);

	try {
		const result = await executor({
			...claim,
			signal: controller.signal,
		});

		await completeGenerationOperation(claim, result);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown execution failure";
		const errorCode =
			error instanceof Error && "code" in error
				? String((error as { code: unknown }).code)
				: "EXECUTION_ERROR";

		await failGenerationOperation(claim, {
			message: errorMessage,
			code: errorCode,
		});
	} finally {
		clearTimeout(timeoutTimer);
		clearInterval(heartbeatTimer);
	}

	const [updatedRow] = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(eq(codebaseGenerationOperations.id, claim.operationId))
		.limit(1);

	if (!updatedRow) {
		throw new Error(
			`Generation operation ${claim.operationId} could not be resolved`,
		);
	}

	return toWorkspaceGenerationOperation(updatedRow);
}
