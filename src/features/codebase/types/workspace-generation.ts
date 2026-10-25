import { z } from "zod";
import { MAX_PROMPT_LENGTH } from "@/lib/constants";

export const workspaceGenerationStageSchema = z.enum([
	"questions",
	"feature",
	"prd",
	"ac",
	"task",
]);
const identity = z.string().min(1).max(128);
const common = { projectId: identity, retry: z.boolean().default(false) };
const billing = {
	idempotencyKey: z.string().max(256).optional(),
	attempt: z.number().int().positive().optional(),
};
const projectInput = z
	.object({ projectId: identity.optional(), ...billing })
	.strict()
	.transform(({ projectId }): { projectId?: string } => ({ projectId }));

export const workspaceGenerationRequestSchema = z
	.discriminatedUnion("stage", [
		z
			.object({
				...common,
				stage: z.literal("questions"),
				input: z
					.object({
						projectId: identity.optional(),
						prompt: z.string().trim().min(3).max(MAX_PROMPT_LENGTH),
						platform: z.enum(["web", "mobile"]).default("web"),
						language: z.enum(["id", "en"]).optional(),
					})
					.strict(),
			})
			.strict(),
		z
			.object({ ...common, stage: z.literal("feature"), input: projectInput })
			.strict(),
		z
			.object({
				...common,
				stage: z.literal("prd"),
				input: z
					.object({
						projectId: identity.optional(),
						mode: z.literal("generate").default("generate"),
						message: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
						...billing,
					})
					.strict()
					.transform(
						({
							projectId,
							mode,
							message,
						}): { projectId?: string; mode: "generate"; message: string } => ({
							projectId,
							mode,
							message,
						}),
					),
			})
			.strict(),
		z
			.object({ ...common, stage: z.literal("ac"), input: projectInput })
			.strict(),
		z
			.object({ ...common, stage: z.literal("task"), input: projectInput })
			.strict(),
	])
	.refine(
		(value) =>
			!value.input.projectId || value.input.projectId === value.projectId,
		{
			message: "Project identity mismatch",
			path: ["input", "projectId"],
		},
	);

export type WorkspaceGenerationRequest = z.infer<
	typeof workspaceGenerationRequestSchema
>;

export const workspaceGenerationOperationSchema = z.object({
	id: identity,
	projectId: identity,
	stage: workspaceGenerationStageSchema,
	status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
	attempt: z.number().int().nonnegative().optional(),
	result: z.record(z.string(), z.unknown()).nullable().optional(),
	error: z.string().nullable().optional(),
	errorCode: z.string().nullable().optional(),
	baselineArtifactId: z.string().nullable().optional(),
	artifactId: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
	startedAt: z.string().nullable().optional(),
	finishedAt: z.string().nullable().optional(),
});
export type WorkspaceGenerationOperation = z.infer<
	typeof workspaceGenerationOperationSchema
>;
