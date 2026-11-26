import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { studioJobs } from "@/db/schema";
import { StudioFrameError } from "./studio-frame-errors";
import type { StudioJobTransaction } from "./studio-job-lease";
import type {
	EnqueueStudioOperationInput,
	EnqueueStudioOperationResult,
} from "./studio-operation-enqueue";

export function studioOperationHash(input: EnqueueStudioOperationInput) {
	return createHash("sha256")
		.update(
			JSON.stringify({
				prompt: input.prompt.trim(),
				frames: [...new Set(input.frameIds ?? [])].sort(),
				bases: Object.entries(input.baseRevisions ?? {}).sort(([a], [b]) =>
					a.localeCompare(b),
				),
			}),
		)
		.digest("hex");
}

export async function readStudioOperationRequest(
	projectId: string,
	userId: string,
	requestId: string,
	hash: string,
	tx: StudioJobTransaction | typeof db = db,
): Promise<EnqueueStudioOperationResult | null> {
	const jobs = await tx
		.select()
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, projectId),
				eq(studioJobs.userId, userId),
				eq(studioJobs.requestId, requestId),
			),
		)
		.orderBy(asc(studioJobs.operationIndex));
	if (jobs.length === 0) return null;
	if (jobs.some((job) => job.requestHash !== hash))
		throw new StudioFrameError("STUDIO_IDEMPOTENCY_CONFLICT");
	const intent = jobs[0].operationIntent;
	if (intent === "add_screen") return { intent, jobs, frames: [] };
	if (intent === "revise_selected" || intent === "revise_project")
		return { intent, jobs };
	throw new StudioFrameError("STUDIO_INVALID_INPUT");
}
