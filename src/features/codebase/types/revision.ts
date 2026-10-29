import { z } from "zod";
import { MAX_PROMPT_LENGTH } from "@/lib/constants";
import { isSafeRelativePath } from "../services/sync-validation";
import { CODEBASE_GENERATION_MAX_PATHS } from "./codebase-constants";

const identity = z.string().trim().min(1).max(128);

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
	})
	.strict();

export type RevisionRequest = z.infer<typeof revisionRequestSchema>;
