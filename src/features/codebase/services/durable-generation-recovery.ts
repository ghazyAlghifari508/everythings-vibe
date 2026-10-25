import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { codebaseGenerationOperations, creditOperations } from "@/db/schema";
import {
	quarantineCreditOperation,
	releaseCreditOperation,
} from "@/lib/services/credit-service";
import type { WorkspaceGenerationStage } from "../types/durable-generation";
import type { CodebaseRunStage } from "./chat-flow-run";
import { withProjectGenerationLock } from "./durable-generation-fence";
import { readWorkspaceGenerationArtifact } from "./workspace-generation-artifact.server";
import { computeJobBillingKey } from "./workspace-generation-credit.server";

export async function recoverStaleGenerationOperations(
	_options: { leaseMs?: number } = {},
): Promise<number> {
	const now = new Date();

	// Select all ambiguous expired running jobs
	const expiredJobs = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.status, "running"),
				lte(codebaseGenerationOperations.leaseExpiresAt, now),
			),
		);

	if (expiredJobs.length === 0) return 0;

	let recoveredCount = 0;

	for (const job of expiredJobs) {
		// Acquire SAME project execution lock as worker
		const lockResult = await withProjectGenerationLock(
			job.projectId,
			async (lockSignal) => {
				if (lockSignal.aborted) return false;

				// CAS: Re-verify job state inside project lock
				const tokenMatch = job.jobToken
					? eq(codebaseGenerationOperations.jobToken, job.jobToken)
					: isNull(codebaseGenerationOperations.jobToken);

				const [current] = await db
					.select()
					.from(codebaseGenerationOperations)
					.where(
						and(
							eq(codebaseGenerationOperations.id, job.id),
							tokenMatch,
							eq(codebaseGenerationOperations.status, "running"),
							lte(codebaseGenerationOperations.leaseExpiresAt, now),
						),
					)
					.limit(1);

				if (!current) return false;

				// Artifact reconciliation: read persisted artifact
				const artifact = await readWorkspaceGenerationArtifact(
					job.userId,
					job.projectId,
					job.stage as CodebaseRunStage,
				);

				const hasNewArtifact =
					Boolean(artifact?.artifactId) &&
					artifact?.artifactId !== job.baselineArtifactId;

				const recoverTime = new Date();

				if (hasNewArtifact && artifact?.artifactId) {
					// Persisted evidence found that is NOT the prior baseline: reconcile as completed
					const updated = await db
						.update(codebaseGenerationOperations)
						.set({
							status: "completed",
							artifactId: artifact.artifactId,
							result: artifact.result ?? null,
							error: null,
							errorCode: null,
							jobToken: null,
							leaseExpiresAt: null,
							finishedAt: recoverTime,
							updatedAt: recoverTime,
						})
						.where(
							and(
								eq(codebaseGenerationOperations.id, job.id),
								tokenMatch,
								eq(codebaseGenerationOperations.status, "running"),
							),
						)
						.returning({ id: codebaseGenerationOperations.id });

					return updated.length > 0;
				}

				// No new artifact: mark terminal failed. Never auto-reexecute ambiguous jobs.
				// Explicit user retry required, bounded by maxAttempts.
				const updated = await db
					.update(codebaseGenerationOperations)
					.set({
						status: "failed",
						error: "Operation lease expired before completion",
						errorCode: "LEASE_EXPIRED",
						jobToken: null,
						leaseExpiresAt: null,
						finishedAt: recoverTime,
						updatedAt: recoverTime,
					})
					.where(
						and(
							eq(codebaseGenerationOperations.id, job.id),
							tokenMatch,
							eq(codebaseGenerationOperations.status, "running"),
						),
					)
					.returning({ id: codebaseGenerationOperations.id });

				// Reconcile pending credit reservation for this exact job billing key
				const billingKey = computeJobBillingKey(
					job.projectId,
					job.stage as WorkspaceGenerationStage,
					job.id,
				);

				const [creditOp] = await db
					.select({ id: creditOperations.id, state: creditOperations.state })
					.from(creditOperations)
					.where(
						and(
							eq(creditOperations.userId, job.userId),
							eq(creditOperations.idempotencyKey, billingKey),
						),
					)
					.orderBy(desc(creditOperations.createdAt))
					.limit(1);

				if (creditOp && creditOp.state === "running") {
					try {
						await releaseCreditOperation({
							userId: job.userId,
							operationId: creditOp.id,
							reason: `Recovery: operation ${job.id} lease expired without artifact`,
						});
					} catch {
						await quarantineCreditOperation({
							userId: job.userId,
							operationId: creditOp.id,
							reason: `Recovery quarantine: operation ${job.id} lease expired`,
						}).catch(() => null);
					}
				}

				return updated.length > 0;
			},
		);

		if (lockResult.acquired && lockResult.value) {
			recoveredCount++;
		}
	}

	return recoveredCount;
}
