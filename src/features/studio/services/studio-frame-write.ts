import { and, desc, eq } from "drizzle-orm";
import { studioFrames, studioRevisions } from "@/db/schema";
import { StudioFrameError } from "./studio-frame-errors";
import type { StudioJobClaim, StudioJobTransaction } from "./studio-job-lease";

export async function persistStudioFrameVersion(
	tx: StudioJobTransaction,
	input: {
		claim: StudioJobClaim;
		frameId: string;
		baseRevision: number;
		htmlCode: string;
		prompt: string;
		name?: string;
	},
) {
	const { claim } = input;
	const [frame] = await tx
		.update(studioFrames)
		.set({
			name: input.name,
			htmlCode: input.htmlCode,
			status: "ready",
			error: null,
			revision: input.baseRevision + 1,
			lastJobId: claim.jobId,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(studioFrames.id, input.frameId),
				eq(studioFrames.projectId, claim.projectId),
				eq(studioFrames.revision, input.baseRevision),
			),
		)
		.returning();
	if (!frame) throw new StudioFrameError("STUDIO_STALE_REVISION");
	const [latest] = await tx
		.select({ version: studioRevisions.version })
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, claim.projectId))
		.orderBy(desc(studioRevisions.version))
		.limit(1);
	await tx.insert(studioRevisions).values({
		projectId: claim.projectId,
		frameId: frame.id,
		frameRevision: frame.revision,
		jobId: claim.jobId,
		prompt: input.prompt,
		htmlCode: input.htmlCode,
		version: (latest?.version ?? 0) + 1,
	});
	return frame;
}
