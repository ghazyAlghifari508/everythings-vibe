import { setTimeout as delay } from "node:timers/promises";
import { db } from "@/db";
import { STUDIO_FRAME_CONCURRENCY } from "../types/studio-constants";
import { listRunnableStudioJobs } from "./studio-job-dependencies";
import {
	recoverStalledStudioJobs,
	STUDIO_WORKER_POLL_MS,
} from "./studio-job-lease";
import { runStudioJobPipeline } from "./studio-job-pipeline";
import { studioWorkerFailure } from "./studio-worker-diagnostics";
import { createStudioWorkerExecution } from "./studio-worker-scheduler";

const STUDIO_DISPATCH_LOCK = "everythings-vibe:studio-dispatch";

export function selectStudioWorkerBatch<T extends { jobType: string }>(
	jobs: T[],
	initialRunning = false,
): T[] {
	const eligible = initialRunning
		? jobs.filter((job) => job.jobType !== "initial")
		: jobs;
	const first = eligible[0];
	if (!first) return [];
	if (first.jobType === "initial") return [first];
	const initialIndex = eligible.findIndex((job) => job.jobType === "initial");
	return eligible.slice(
		0,
		initialIndex < 0
			? STUDIO_FRAME_CONCURRENCY
			: Math.min(initialIndex, STUDIO_FRAME_CONCURRENCY),
	);
}

export async function dispatchStudioWorkerBatch(
	shutdownSignal?: AbortSignal,
): Promise<number> {
	const connection = await db.$client.connect();
	const lostConnection = new AbortController();
	const signal = shutdownSignal
		? AbortSignal.any([shutdownSignal, lostConnection.signal])
		: lostConnection.signal;
	const active = new Map<string, { initial: boolean; work: Promise<void> }>();
	let wake = Promise.withResolvers<void>();
	const notify = () => wake.resolve();
	const execution = createStudioWorkerExecution(notify);
	const onConnectionError = () => {
		lostConnection.abort();
		notify();
	};
	connection.on("error", onConnectionError);
	let locked = false;
	let processed = 0;
	try {
		const result = await connection.query<{ locked: boolean }>(
			"select pg_try_advisory_lock(hashtextextended($1, 0)) as locked",
			[STUDIO_DISPATCH_LOCK],
		);
		locked = result.rows[0]?.locked === true;
		if (!locked) return 0;
		// Keep the cross-replica lock; all planning, naming and frame work shares 3 slots.
		while (!signal.aborted) {
			await recoverStalledStudioJobs();
			const pending = await listRunnableStudioJobs();
			const batch = selectStudioWorkerBatch(
				pending.filter((job) => !active.has(job.id)),
				[...active.values()].some((entry) => entry.initial),
			).slice(0, STUDIO_FRAME_CONCURRENCY - active.size);
			for (const job of batch) {
				const work = runStudioJobPipeline(
					job.id,
					job.projectId,
					job.userId,
					signal,
					execution,
				)
					.catch((error: unknown) =>
						console.error(
							JSON.stringify(studioWorkerFailure(error, "dispatch-job")),
						),
					)
					.finally(() => {
						active.delete(job.id);
						notify();
					});
				active.set(job.id, { initial: job.jobType === "initial", work });
				processed++;
			}
			if (batch.length) continue;
			if (!active.size) break;
			const timer = new AbortController();
			try {
				await Promise.race([
					wake.promise,
					delay(STUDIO_WORKER_POLL_MS, undefined, {
						signal: timer.signal,
					}).catch(() => {}),
				]);
			} finally {
				timer.abort();
				wake = Promise.withResolvers<void>();
			}
		}
		return processed;
	} finally {
		if (signal.aborted) lostConnection.abort();
		await Promise.allSettled([...active.values()].map((entry) => entry.work));
		connection.off("error", onConnectionError);
		let reusable = !lostConnection.signal.aborted;
		try {
			if (locked && reusable)
				await connection.query(
					"select pg_advisory_unlock(hashtextextended($1, 0))",
					[STUDIO_DISPATCH_LOCK],
				);
		} catch {
			reusable = false;
		}
		// A session that may still hold the cluster-wide dispatch lock is destroyed
		// instead of returning to the pool: the server releases the lock when that
		// session ends, and no later worker can inherit a lock it never took.
		connection.release(!reusable);
	}
}
