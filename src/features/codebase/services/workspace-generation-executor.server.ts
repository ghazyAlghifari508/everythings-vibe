import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { creditOperations, projects } from "@/db/schema";
import { handleAcGenerateRequest } from "@/features/greenfield/services/ac-generate.server";
import { handleAskOptionsRequest } from "@/features/greenfield/services/ask-options-route.server";
import { handleFeatureGenerateRequest } from "@/features/greenfield/services/feature-generate.server";
import { handlePrdChatRequest } from "@/features/greenfield/services/prd-chat-route.server";
import { handleTaskGenerateRequest } from "@/features/greenfield/services/task-generate.server";
import {
	isReleasableReservation,
	quarantineCreditOperation,
	releaseCreditOperation,
} from "@/lib/services/credit-service";
import { readSseStream } from "@/lib/sse-stream";
import type {
	DurableGenerationClaim,
	WorkspaceGenerationExecutionResult,
	WorkspaceGenerationStage,
} from "../types/durable-generation";
import { readWorkspaceGenerationArtifact } from "./workspace-generation-artifact.server";

export interface WorkspaceGenerationLiveEvent {
	type: string;
	stage: WorkspaceGenerationStage;
	phase?: "thinking" | "generating" | "done" | "error";
	summaryMessage?: string;
	error?: string;
	[key: string]: unknown;
}

export type GenerationEventListener = (
	event: WorkspaceGenerationLiveEvent,
) => void;

/**
 * Pre-execution audit and guard for credit safety:
 * - If an existing credit operation is quarantined: forbid execution pending accounting review.
 * - If an existing credit operation is stuck in running from a prior crashed attempt without an artifact:
 *   release or quarantine it before initiating a new attempt.
 */
export async function prepareStageCreditGuard(
	claim: DurableGenerationClaim,
): Promise<void> {
	if (claim.stage !== "prd" && claim.stage !== "ac" && claim.stage !== "task") {
		return;
	}

	const existingCredits = await db
		.select({
			id: creditOperations.id,
			state: creditOperations.state,
		})
		.from(creditOperations)
		.where(
			and(
				eq(creditOperations.userId, claim.userId),
				eq(creditOperations.projectId, claim.projectId),
				eq(creditOperations.stage, claim.stage),
			),
		)
		.orderBy(desc(creditOperations.createdAt))
		.limit(5);

	for (const op of existingCredits) {
		if (op.state === "quarantined") {
			const err = new Error(
				`Credit operation ${op.id} is quarantined; retry forbidden pending review.`,
			);
			(err as { code?: string }).code = "CREDIT_QUARANTINED";
			throw err;
		}

		if (op.state === "running") {
			const artifact = await readWorkspaceGenerationArtifact(
				claim.userId,
				claim.projectId,
				claim.stage,
			);
			if (!artifact) {
				// Prior worker crashed mid-generation without an artifact.
				// Settle/release prior reservation once before allowing new attempt.
				try {
					await releaseCreditOperation({
						userId: claim.userId,
						operationId: op.id,
						reason: `Pre-execution cleanup: crashed run for operation ${claim.operationId}`,
					});
				} catch {
					await quarantineCreditOperation({
						userId: claim.userId,
						operationId: op.id,
						reason: `Pre-execution quarantine: crashed run for operation ${claim.operationId}`,
					}).catch(() => {});
				}
			}
		}
	}
}

/**
 * Drains an SSE stream from greenfield generation routes (PRD, AC, Task).
 * Forwards genuine streaming events to optional listener while ensuring
 * raw internal model private reasoning tokens are not leaked.
 */
export async function drainGenerationSseStream(
	body: ReadableStream<Uint8Array> | null | undefined,
	stage: WorkspaceGenerationStage,
	signal?: AbortSignal,
	onEvent?: GenerationEventListener,
): Promise<{ ok: boolean; donePayload?: unknown; error?: string }> {
	if (!body) return { ok: true };
	let streamError: string | null = null;
	let donePayload: unknown = null;

	for await (const raw of readSseStream(body)) {
		if (signal?.aborted) {
			const abortErr = new Error("Generation operation aborted by worker");
			abortErr.name = "AbortError";
			throw abortErr;
		}
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				if (parsed.type === "error") {
					streamError =
						typeof parsed.error === "string"
							? parsed.error
							: "Generasi AI gagal di tengah jalan.";
					onEvent?.({
						type: "error",
						stage,
						phase: "error",
						error: streamError,
					});
				} else if (parsed.type === "done") {
					donePayload = parsed;
					onEvent?.({
						type: "done",
						stage,
						phase: "done",
						summaryMessage:
							typeof parsed.summaryMessage === "string"
								? parsed.summaryMessage
								: undefined,
					});
				} else if (parsed.type === "started") {
					onEvent?.({
						type: "started",
						stage,
						phase: "generating",
					});
				} else if (
					parsed.type === "thinking" ||
					parsed.type === "thinking_reset"
				) {
					// Safe activity event: emit high-level activity phase without leaking raw private reasoning
					onEvent?.({
						type: "activity",
						stage,
						phase: "thinking",
					});
				} else if (parsed.type === "delta") {
					onEvent?.({
						type: "delta",
						stage,
						phase: "generating",
					});
				}
			}
		} catch {
			// Ignore malformed non-JSON chunk
		}
	}

	if (streamError) {
		throw new Error(streamError);
	}
	return { ok: true, donePayload };
}

/**
 * Core stage execution adapter.
 * Runs accepted background generation operations using existing greenfield handlers
 * without requiring session credentials, passes worker AbortSignal and stable job billing key,
 * drains live SSE events, and validates persisted artifacts before completion.
 */
export async function executeWorkspaceGenerationStage(
	claim: DurableGenerationClaim,
	onEvent?: GenerationEventListener,
): Promise<WorkspaceGenerationExecutionResult> {
	if (claim.signal?.aborted) {
		const abortErr = new Error("Generation operation aborted before starting");
		abortErr.name = "AbortError";
		throw abortErr;
	}

	// Credit safety guard check
	await prepareStageCreditGuard(claim);

	const billingKey = `${claim.projectId}:${claim.stage}:${claim.operationId}`;
	const context = {
		userId: claim.userId,
		signal: claim.signal,
		billingKey,
	};

	const baselineArtifactId =
		typeof claim.input.baselineArtifactId === "string"
			? claim.input.baselineArtifactId
			: null;

	switch (claim.stage) {
		case "questions": {
			const prompt =
				typeof claim.input.prompt === "string" ? claim.input.prompt : "";
			const platform =
				claim.input.platform === "mobile" ? "mobile" : "web";
			const language =
				typeof claim.input.language === "string"
					? claim.input.language
					: undefined;

			const req = new Request("http://internal/api/ask/options", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: claim.projectId,
					prompt,
					platform,
					language,
				}),
				signal: claim.signal,
			});

			const response = await handleAskOptionsRequest(req, context);
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					error?: string;
					code?: string;
				};
				const error = new Error(body.error || "Question generation failed");
				if (body.code) (error as { code?: string }).code = body.code;
				throw error;
			}
			break;
		}

		case "feature": {
			// If this is a retry or explicit reset, clear completed status so feature handler doesn't just return stale cache
			if (claim.input.retry) {
				await db
					.update(projects)
					.set({ featuresStatus: "pending" })
					.where(eq(projects.id, claim.projectId));
			}

			const req = new Request("http://internal/api/features/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId: claim.projectId }),
				signal: claim.signal,
			});

			const response = await handleFeatureGenerateRequest(req, context);
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(body.error || "Feature specification generation failed");
			}
			break;
		}

		case "prd": {
			const message =
				typeof claim.input.message === "string" ? claim.input.message : "";
			const req = new Request("http://internal/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: claim.projectId,
					message,
					mode: "generate",
				}),
				signal: claim.signal,
			});

			const response = await handlePrdChatRequest(req, context);
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(body.error || "PRD generation setup failed");
			}

			await drainGenerationSseStream(response.body, "prd", claim.signal, onEvent);
			break;
		}

		case "ac": {
			const req = new Request("http://internal/api/ac/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId: claim.projectId }),
				signal: claim.signal,
			});

			const response = await handleAcGenerateRequest(req, context);
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(body.error || "AC generation setup failed");
			}

			await drainGenerationSseStream(response.body, "ac", claim.signal, onEvent);
			break;
		}

		case "task": {
			const req = new Request("http://internal/api/task/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId: claim.projectId }),
				signal: claim.signal,
			});

			const response = await handleTaskGenerateRequest(req, context);
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(body.error || "Task generation setup failed");
			}

			await drainGenerationSseStream(response.body, "task", claim.signal, onEvent);
			break;
		}

		default: {
			const exhaustive: never = claim.stage;
			throw new Error(`Unsupported generation stage: ${exhaustive}`);
		}
	}

	// Contractual completion gate: An operation is only completed if a valid persisted artifact exists
	const artifact = await readWorkspaceGenerationArtifact(
		claim.userId,
		claim.projectId,
		claim.stage,
	);

	if (!artifact) {
		const persistenceErr = new Error(
			`Artifact was not persisted to database for stage ${claim.stage}`,
		);
		(persistenceErr as { code?: string }).code = "ARTIFACT_PERSISTENCE_FAILED";
		throw persistenceErr;
	}

	// Source-revision guard: If a baseline artifact was provided for a new run/retry,
	// verify that the artifact actually progressed rather than synthesizing false completion on unchanged data.
	if (
		baselineArtifactId &&
		claim.input.retry &&
		artifact.artifactId === baselineArtifactId
	) {
		const unchangedErr = new Error(
			`Generation artifact for stage ${claim.stage} did not produce a new version (identical to baseline: ${baselineArtifactId}).`,
		);
		(unchangedErr as { code?: string }).code = "ARTIFACT_UNCHANGED";
		throw unchangedErr;
	}

	return {
		artifactId: artifact.artifactId,
		result: artifact.result,
	};
}

/**
 * Recovers stale or interrupted generation status after server crash or disconnect.
 * Reconciles DB generation lock and credit state against actual persisted artifacts.
 */
export async function recoverStaleGenerationState(
	userId: string,
	projectId: string,
	stage: WorkspaceGenerationStage,
): Promise<{ recovered: boolean; artifactId?: string | null; reset?: boolean }> {
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

	// 2. No artifact persisted: release or quarantine stuck credit operations & reset lock
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

	// Clean up stale credit reservation for paid stages
	if (stage === "prd" || stage === "ac" || stage === "task") {
		const stuckOps = await db
			.select({ id: creditOperations.id, state: creditOperations.state })
			.from(creditOperations)
			.where(
				and(
					eq(creditOperations.userId, userId),
					eq(creditOperations.projectId, projectId),
					eq(creditOperations.stage, stage),
					inArray(creditOperations.state, ["quoted", "reserved", "running"]),
				),
			)
			.orderBy(desc(creditOperations.createdAt));

		for (const op of stuckOps) {
			if (isReleasableReservation(op.state)) {
				try {
					await releaseCreditOperation({
						userId,
						operationId: op.id,
						reason: "Stale generating recovery: process crashed without artifact",
					});
				} catch {
					// Best-effort release, quarantine on error
					await quarantineCreditOperation({
						userId,
						operationId: op.id,
						reason: "Stale generating quarantine during recovery",
					}).catch(() => {});
				}
			}
		}
	}

	return { recovered: true, reset: true };
}
