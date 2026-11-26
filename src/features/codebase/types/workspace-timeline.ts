import { z } from "zod";
import { MAX_PROMPT_LENGTH } from "@/lib/constants";
import {
	type AskHandoff,
	askHandoffQuestionSchema,
} from "../services/generation-context-handoff";
import type { WorkspaceGenerationOperation } from "./workspace-generation";

export const workspaceEventStageSchema = z.enum([
	"questions",
	"feature",
	"prd",
	"ac",
	"task",
	"handoff",
]);
export const workspaceEventSchema = z.object({
	id: z.string().min(1),
	codebaseId: z.string().min(1),
	projectId: z.string().min(1),
	type: z.enum([
		"user_message",
		"assistant_message",
		"question_set",
		"question_answered",
		"generation",
		"artifact_created",
		"revision_requested",
		"revision_proposed",
		"revision_completed",
		"revision_rejected",
		"handoff_ready",
	]),
	stage: workspaceEventStageSchema,
	status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
	content: z.string().optional(),
	operationId: z.string().optional(),
	artifactId: z.string().optional(),
	proposalId: z.string().optional(),
	questionId: z.string().optional(),
	questions: z.array(askHandoffQuestionSchema).optional(),
	answers: z.record(z.string(), z.string()).optional(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});
export type WorkspaceEvent = z.infer<typeof workspaceEventSchema>;
export type WorkspaceScope = Pick<WorkspaceEvent, "codebaseId" | "projectId">;
export const workspaceScopeSchema = workspaceEventSchema.pick({
	codebaseId: true,
	projectId: true,
});
export const workspaceMessageInputSchema = workspaceScopeSchema
	.extend({
		id: z.string().min(1).max(256),
		content: z.string().trim().min(3).max(MAX_PROMPT_LENGTH),
		stage: workspaceEventStageSchema,
		type: z.enum(["user_message", "revision_requested"]),
	})
	.strict();
export type WorkspaceMessageInput = z.infer<typeof workspaceMessageInputSchema>;
export interface WorkspaceTimelineSource extends WorkspaceScope {
	createdAt: string;
	handoff: AskHandoff | null;
	operations: WorkspaceGenerationOperation[];
	artifacts: Array<{
		id: string;
		stage: "feature" | "prd" | "ac" | "task";
		createdAt: string;
	}>;
	revisions: Array<{
		id: string;
		targetKind: "feature" | "prd" | "ac" | "tasks";
		instruction: string;
		status: "pending" | "approved" | "rejected";
		idempotencyKey: string;
		createdAt: string;
		approvedAt: string | null;
		appliedVersionId: string | null;
	}>;
}
