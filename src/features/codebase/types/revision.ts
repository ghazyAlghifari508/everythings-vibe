import { z } from "zod";
import { MAX_PROMPT_LENGTH } from "@/lib/constants";
import { isSafeRelativePath } from "../services/sync-validation";
import { CODEBASE_GENERATION_MAX_PATHS } from "./codebase-constants";

const identity = z.string().trim().min(1).max(128);

export const composerArtifactReferenceSchema = z
	.object({
		kind: z.literal("artifact"),
		id: identity,
		projectId: identity,
		targetKind: z.enum(["feature", "prd", "ac", "tasks"]),
		label: z.string().trim().min(1).max(256),
		fileName: z.string().trim().min(1).max(256),
		versionId: identity.optional(),
	})
	.strict();

export const composerFileReferenceSchema = z
	.object({
		kind: z.literal("file"),
		id: z.string().trim().min(1).max(1040),
		path: z.string().max(1024).refine(isSafeRelativePath),
		codebaseId: identity,
		snapshotId: identity,
	})
	.strict();

export const composerReferenceBindingSchema = z.discriminatedUnion("kind", [
	composerArtifactReferenceSchema,
	composerFileReferenceSchema,
]);

export type ComposerArtifactReference = z.infer<
	typeof composerArtifactReferenceSchema
>;
export type ComposerFileReference = z.infer<typeof composerFileReferenceSchema>;
export type ComposerReferenceBinding = z.infer<
	typeof composerReferenceBindingSchema
>;

export const revisionRequestSchema = z
	.object({
		projectId: identity,
		codebaseId: identity,
		targetArtifactKind: z.enum(["feature", "prd", "ac", "tasks"]),
		targetArtifactVersionId: identity,
		userInstruction: z
			.string()
			.max(MAX_PROMPT_LENGTH)
			.refine((value) => value.trim().length > 0),
		sourceSnapshotId: identity,
		optionalReferences: z
			.array(z.string().max(1024).refine(isSafeRelativePath))
			.max(CODEBASE_GENERATION_MAX_PATHS)
			.optional(),
		referenceBindings: z
			.array(composerReferenceBindingSchema)
			.max(CODEBASE_GENERATION_MAX_PATHS)
			.optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (!value.referenceBindings) return;
		for (const [index, binding] of value.referenceBindings.entries()) {
			if (
				binding.kind === "artifact" &&
				binding.projectId !== value.projectId
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["referenceBindings", index, "projectId"],
					message: "Referensi dokumen berasal dari project berbeda.",
				});
			}
			if (binding.kind === "file") {
				if (binding.codebaseId !== value.codebaseId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["referenceBindings", index, "codebaseId"],
						message: "Referensi file berasal dari repository berbeda.",
					});
				}
				if (binding.snapshotId !== value.sourceSnapshotId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["referenceBindings", index, "snapshotId"],
						message: "Referensi file berasal dari snapshot yang sudah usang.",
					});
				}
			}
		}
	});

export type RevisionRequest = z.infer<typeof revisionRequestSchema>;
