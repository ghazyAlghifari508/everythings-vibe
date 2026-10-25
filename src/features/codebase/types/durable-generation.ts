import type { z } from "zod";
import type {
	WorkspaceGenerationOperation,
	workspaceGenerationStageSchema,
} from "./workspace-generation";

export type WorkspaceGenerationStage = z.infer<
	typeof workspaceGenerationStageSchema
>;

export type DurableGenerationStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface DurableGenerationSource {
	codebaseId: string;
	snapshotId: string;
	analysisId?: string;
	inputRevision: string;
}

export interface DurableGenerationClaim {
	operationId: string;
	userId: string;
	projectId: string;
	stage: WorkspaceGenerationStage;
	token: string;
	attempt: number;
	input: Record<string, unknown>;
	source?: DurableGenerationSource | null;
	baselineArtifactId?: string | null;
	signal: AbortSignal;
}

export interface WorkspaceGenerationExecutionResult {
	artifactId?: string | null;
	result?: Record<string, unknown> | null;
}

export type WorkspaceGenerationExecutor = (
	claim: DurableGenerationClaim,
) => Promise<WorkspaceGenerationExecutionResult>;

export interface DurableExecutionOptions {
	leaseMs?: number;
	heartbeatMs?: number;
	timeoutMs?: number;
}

export type { WorkspaceGenerationOperation };
