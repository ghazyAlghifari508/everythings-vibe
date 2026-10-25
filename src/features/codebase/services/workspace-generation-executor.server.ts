import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { handleAcGenerateRequest } from "@/features/greenfield/services/ac-generate.server";
import { handleAskOptionsRequest } from "@/features/greenfield/services/ask-options-route.server";
import { handleFeatureGenerateRequest } from "@/features/greenfield/services/feature-generate.server";
import { handlePrdChatRequest } from "@/features/greenfield/services/prd-chat-route.server";
import { handleTaskGenerateRequest } from "@/features/greenfield/services/task-generate.server";
import type {
	DurableGenerationClaim,
	WorkspaceGenerationExecutionResult,
} from "../types/durable-generation";
import { verifyClaimLeaseFence } from "./durable-generation-fence";
import { readWorkspaceGenerationArtifact } from "./workspace-generation-artifact.server";
import {
	computeJobBillingKey,
	prepareStageCreditGuard,
	recoverStaleGenerationState,
} from "./workspace-generation-credit.server";
import { resolveWorkspaceGenerationSource } from "./workspace-generation-source.server";
import {
	drainGenerationSseStream,
	type GenerationEventListener,
	type WorkspaceGenerationLiveEvent,
} from "./workspace-generation-stream.server";

export {
	drainGenerationSseStream,
	prepareStageCreditGuard,
	recoverStaleGenerationState,
	type GenerationEventListener,
	type WorkspaceGenerationLiveEvent,
};

const questionsInputSchema = z.object({
	prompt: z.string().trim().min(1).default(""),
	platform: z.enum(["web", "mobile"]).default("web"),
	language: z.enum(["id", "en"]).optional(),
});

const featureInputSchema = z.object({
	retry: z.boolean().optional(),
});

const prdInputSchema = z.object({
	message: z.string().trim().min(1).default(""),
	mode: z.literal("generate").default("generate"),
});

/**
 * Core stage execution adapter.
 * Runs accepted background generation operations using existing greenfield handlers
 * without requiring session credentials, passes worker AbortSignal and stable job billing key,
 * checks beforePersist fences, drains live SSE events, and validates persisted artifacts before completion.
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

	// Source revision check BEFORE invoking AI: context cannot change silently
	if (claim.source?.inputRevision) {
		const initialSource = await resolveWorkspaceGenerationSource(
			claim.userId,
			claim.projectId,
			claim.stage,
		);
		if (
			!initialSource ||
			"code" in initialSource ||
			initialSource.inputRevision !== claim.source.inputRevision
		) {
			const err = new Error(
				"Source context revision changed before AI generation",
			);
			(err as { code?: string }).code = "SOURCE_REVISION_MISMATCH";
			throw err;
		}
	}

	// Credit safety guard check scoped to exact billingKey
	await prepareStageCreditGuard(claim);

	const billingKey = computeJobBillingKey(
		claim.projectId,
		claim.stage,
		claim.operationId,
	);

	// Advisory and lease fence check before any persisted artifact is written
	const beforePersist = async (): Promise<void> => {
		if (claim.signal?.aborted) {
			const abortErr = new Error("Generation operation aborted before persist");
			abortErr.name = "AbortError";
			throw abortErr;
		}

		if (claim.token) {
			const leaseValid = await verifyClaimLeaseFence(
				claim.operationId,
				claim.token,
			);
			if (!leaseValid) {
				const leaseErr = new Error(
					"Worker lease fence check failed before persist",
				);
				(leaseErr as { code?: string }).code = "LEASE_EXPIRED";
				throw leaseErr;
			}
		}

		if (claim.source?.inputRevision) {
			const currentSource = await resolveWorkspaceGenerationSource(
				claim.userId,
				claim.projectId,
				claim.stage,
			);
			if (
				!currentSource ||
				"code" in currentSource ||
				currentSource.inputRevision !== claim.source.inputRevision
			) {
				const mismatchErr = new Error(
					"Source context revision changed during AI generation before persist",
				);
				(mismatchErr as { code?: string }).code = "SOURCE_REVISION_MISMATCH";
				throw mismatchErr;
			}
		}
	};

	const context = {
		userId: claim.userId,
		signal: claim.signal,
		billingKey,
		beforePersist,
	};

	// claim.baselineArtifactId is a trusted backend field on the claim, with fallback to claim.input.baselineArtifactId
	const baselineArtifactId =
		claim.baselineArtifactId ??
		((claim.input as Record<string, unknown> | undefined)?.baselineArtifactId as
			| string
			| undefined) ??
		null;

	switch (claim.stage) {
		case "questions": {
			const parsed = questionsInputSchema.parse(claim.input);
			const req = new Request("http://internal/api/ask/options", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: claim.projectId,
					prompt: parsed.prompt,
					platform: parsed.platform,
					language: parsed.language,
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
			const parsed = featureInputSchema.parse(claim.input);
			if (parsed.retry) {
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
					code?: string;
				};
				const err = new Error(
					body.error || "Feature specification generation failed",
				);
				if (body.code) (err as { code?: string }).code = body.code;
				throw err;
			}
			break;
		}

		case "prd": {
			const parsed = prdInputSchema.parse(claim.input);
			const req = new Request("http://internal/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: claim.projectId,
					message: parsed.message,
					mode: parsed.mode,
				}),
				signal: claim.signal,
			});

			const response = await handlePrdChatRequest(req, context);
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					error?: string;
					code?: string;
				};
				const err = new Error(body.error || "PRD generation setup failed");
				if (body.code) (err as { code?: string }).code = body.code;
				throw err;
			}

			await drainGenerationSseStream(
				response.body,
				"prd",
				claim.signal,
				onEvent,
			);
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
					code?: string;
				};
				const err = new Error(body.error || "AC generation setup failed");
				if (body.code) (err as { code?: string }).code = body.code;
				throw err;
			}

			await drainGenerationSseStream(
				response.body,
				"ac",
				claim.signal,
				onEvent,
			);
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
					code?: string;
				};
				const err = new Error(body.error || "Task generation setup failed");
				if (body.code) (err as { code?: string }).code = body.code;
				throw err;
			}

			await drainGenerationSseStream(
				response.body,
				"task",
				claim.signal,
				onEvent,
			);
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

	if (!artifact || !artifact.artifactId) {
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
