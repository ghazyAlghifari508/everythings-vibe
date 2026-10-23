import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { studioJobs } from "@/db/schema";
import { STUDIO_FRAME_CONCURRENCY } from "../types/studio-constants";
import { recoverStalledStudioJobs } from "./studio-job-lease";
import { runStudioJobPipeline } from "./studio-job-pipeline";
import { studioWorkerFailure } from "./studio-worker-diagnostics";

const STUDIO_DISPATCH_LOCK = "everythings-vibe:studio-dispatch";

export function selectStudioWorkerBatch<T extends { jobType: string }>(
	jobs: T[],
): T[] {
	const first = jobs[0];
	if (!first) return [];
	if (first.jobType === "initial") return [first];
	const initialIndex = jobs.findIndex((job) => job.jobType === "initial");
	return jobs.slice(
		0,
		initialIndex < 0
			? STUDIO_FRAME_CONCURRENCY
			: Math.min(initialIndex, STUDIO_FRAME_CONCURRENCY),
	);
}

export async function dispatchStudioWorkerBatch(): Promise<number> {
	const connection = await db.$client.connect();
	let locked = false;
	try {
		const result = await connection.query<{ locked: boolean }>(
			"select pg_try_advisory_lock(hashtextextended($1, 0)) as locked",
			[STUDIO_DISPATCH_LOCK],
		);
		locked = result.rows[0]?.locked === true;
		if (!locked) return 0;
		// Session lock caps aggregate model concurrency across worker replicas without an AI-length transaction.
		await recoverStalledStudioJobs();
		const pending = await db
			.select()
			.from(studioJobs)
			.where(and(eq(studioJobs.status, "queued"), isNull(studioJobs.claimedBy)))
			.orderBy(asc(studioJobs.createdAt))
			.limit(STUDIO_FRAME_CONCURRENCY);
		const batch = selectStudioWorkerBatch(pending);
		const results = await Promise.allSettled(
			batch.map((job) =>
				runStudioJobPipeline(job.id, job.projectId, job.userId),
			),
		);
		for (const result of results)
			if (result.status === "rejected")
				console.error(
					JSON.stringify(studioWorkerFailure(result.reason, "dispatch-job")),
				);
		return batch.length;
	} finally {
		try {
			if (locked)
				await connection.query(
					"select pg_advisory_unlock(hashtextextended($1, 0))",
					[STUDIO_DISPATCH_LOCK],
				);
		} finally {
			connection.release();
		}
	}
}
