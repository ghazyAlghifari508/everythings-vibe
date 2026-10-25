import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { creditOperations, projects } from "@/db/schema";
import {
	isReleasableReservation,
	quarantineCreditOperation,
	releaseCreditOperation,
} from "@/lib/services/credit-service";
import type {
	DurableGenerationClaim,
	WorkspaceGenerationStage,
} from "../types/durable-generation";
import { readWorkspaceGenerationArtifact } from "./workspace-generation-artifact.server";

export function computeJobBillingKey(
	projectId: string,
	stage: WorkspaceGenerationStage,
	operationId: string,
): string {
	return `${projectId}:${stage}:${operationId}`;
}

/**
 * Pre-execution audit and guard for credit safety:
 * - Scoped strictly to the EXACT job billingKey (`${claim.projectId}:${claim.stage}:${claim.operationId}`).
 * - NEVER releases project-wide running operations which may belong to other live concurrent operations.
 * - If this job's credit operation is quarantined: forbid execution pending review.
 * - If this job's credit operation was left in running from a prior crashed attempt of the same operation:
 *   attempt release; on error quarantine. Quarantine failures are NEVER swallowed.
 */
export async function prepareStageCreditGuard(
	claim: DurableGenerationClaim,
): Promise<void> {
	if (claim.stage !== "prd" && claim.stage !== "ac" && claim.stage !== "task") {
		return;
	}

	const billingKey = computeJobBillingKey(
		claim.projectId,
		claim.stage,
		claim.operationId,
	);

	const existingCredits = await db
		.select({
			id: creditOperations.id,
			state: creditOperations.state,
		})
		.from(creditOperations)
		.where(
			and(
				eq(creditOperations.userId, claim.userId),
				eq(creditOperations.idempotencyKey, billingKey),
			),
		)
		.orderBy(desc(creditOperations.createdAt))
		.limit(1);

	const op = existingCredits[0];
	if (!op) return;

	if (op.state === "quarantined") {
		const err = new Error(
			`Credit operation ${op.id} is quarantined; retry forbidden pending review.`,
		);
		(err as { code?: string }).code = "CREDIT_QUARANTINED";
		throw err;
	}

	if (op.state === "settled") {
		const artifact = await readWorkspaceGenerationArtifact(
			claim.userId,
			claim.projectId,
			claim.stage,
		);
		if (artifact) {
			// Already settled artifact for this exact operation identity:
			// no auto fresh charge permitted.
			const err = new Error(
				`Artifact already settled for operation ${claim.operationId}; fresh charge blocked.`,
			);
			(err as { code?: string }).code = "CREDIT_ALREADY_SETTLED";
			throw err;
		}
	}

	if (op.state === "running") {
		const artifact = await readWorkspaceGenerationArtifact(
			claim.userId,
			claim.projectId,
			claim.stage,
		);
		if (!artifact) {
			// Prior attempt for this exact job crashed mid-generation without an artifact.
			// Release prior reservation or quarantine. Never swallow quarantine failure.
			try {
				await releaseCreditOperation({
					userId: claim.userId,
					operationId: op.id,
					reason: `Pre-execution cleanup: crashed run for operation ${claim.operationId}`,
				});
			} catch (_releaseErr) {
				try {
					await quarantineCreditOperation({
						userId: claim.userId,
						operationId: op.id,
						reason: `Pre-execution quarantine: crashed run for operation ${claim.operationId}`,
					});
				} catch (quarantineErr) {
					console.error(
						`[CreditGuard] Quarantine failed for operation ${op.id}:`,
						quarantineErr,
					);
					throw quarantineErr;
				}
			}
		}
	}
}

/**
 * Recovers stale or interrupted generation status after server crash or disconnect.
 * Reconciles DB generation lock and credit state against actual persisted artifacts.
 */
export async function recoverStaleGenerationState(
	userId: string,
	projectId: string,
	stage: WorkspaceGenerationStage,
	operationId?: string,
): Promise<{
	recovered: boolean;
	artifactId?: string | null;
	reset?: boolean;
}> {
	// 1. Check if a valid artifact was already persisted before crash
	const artifact = await readWorkspaceGenerationArtifact(
		userId,
		projectId,
		stage,
	);

	if (artifact) {
		// Artifact exists: ensure stage lock is set to completed
		if (stage === "feature") {
			await db
				.update(projects)
				.set({ featuresStatus: "completed" })
				.where(eq(projects.id, projectId));
		} else if (stage === "task") {
			await db
				.update(projects)
				.set({ taskStatus: "completed" })
				.where(eq(projects.id, projectId));
		} else if (stage === "ac") {
			await db
				.update(projects)
				.set({ acStatus: "completed" })
				.where(eq(projects.id, projectId));
		}
		return { recovered: true, artifactId: artifact.artifactId };
	}

	// 2. No artifact persisted: reset generating status
	if (stage === "feature") {
		await db
			.update(projects)
			.set({ featuresStatus: "pending" })
			.where(
				and(
					eq(projects.id, projectId),
					eq(projects.featuresStatus, "generating"),
				),
			);
	} else if (stage === "ac") {
		await db
			.update(projects)
			.set({ acStatus: "pending" })
			.where(
				and(eq(projects.id, projectId), eq(projects.acStatus, "generating")),
			);
	} else if (stage === "task") {
		await db
			.update(projects)
			.set({ taskStatus: "pending" })
			.where(
				and(eq(projects.id, projectId), eq(projects.taskStatus, "generating")),
			);
	}

	// Clean up stale credit reservation for paid stages without touching live operations
	if (stage === "prd" || stage === "ac" || stage === "task") {
		if (operationId) {
			const billingKey = computeJobBillingKey(projectId, stage, operationId);
			const [op] = await db
				.select({ id: creditOperations.id, state: creditOperations.state })
				.from(creditOperations)
				.where(
					and(
						eq(creditOperations.userId, userId),
						eq(creditOperations.idempotencyKey, billingKey),
					),
				)
				.limit(1);

			if (op && isReleasableReservation(op.state)) {
				try {
					await releaseCreditOperation({
						userId,
						operationId: op.id,
						reason: `Stale generating recovery: crashed without artifact for ${operationId}`,
					});
				} catch (_relErr) {
					try {
						await quarantineCreditOperation({
							userId,
							operationId: op.id,
							reason: `Stale generating recovery quarantine for ${operationId}`,
						});
					} catch (quarantineErr) {
						console.error(
							`[CreditRecovery] Quarantine failed for operation ${op.id}:`,
							quarantineErr,
						);
						throw quarantineErr;
					}
				}
			}
		} else {
			// Only release non-running reservations (quoted, reserved) that were abandoned.
			// Never release running reservations without exact operation identity.
			const releasableOps = await db
				.select({ id: creditOperations.id, state: creditOperations.state })
				.from(creditOperations)
				.where(
					and(
						eq(creditOperations.userId, userId),
						eq(creditOperations.projectId, projectId),
						eq(creditOperations.stage, stage),
						inArray(creditOperations.state, ["quoted", "reserved"]),
					),
				)
				.orderBy(desc(creditOperations.createdAt));

			for (const op of releasableOps) {
				try {
					await releaseCreditOperation({
						userId,
						operationId: op.id,
						reason:
							"Stale generating recovery: process crashed without artifact",
					});
				} catch (_relErr) {
					try {
						await quarantineCreditOperation({
							userId,
							operationId: op.id,
							reason: "Stale generating recovery quarantine",
						});
					} catch (quarantineErr) {
						console.error(
							`[CreditRecovery] Quarantine failed for operation ${op.id}:`,
							quarantineErr,
						);
						throw quarantineErr;
					}
				}
			}
		}
	}

	return { recovered: true, reset: true };
}
