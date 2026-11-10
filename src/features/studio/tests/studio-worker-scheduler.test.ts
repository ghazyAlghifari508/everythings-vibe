import { expect, it, vi } from "vitest";
import { createStudioWorkerExecution } from "../services/studio-worker-scheduler";
import { STUDIO_FRAME_CONCURRENCY } from "../types/studio-constants";

it("never exceeds the shared slot ceiling across planning and frame work", async () => {
	let running = 0;
	let peak = 0;
	const execution = createStudioWorkerExecution(() => {});
	const gate = Promise.withResolvers<void>();
	const tasks = Array.from({ length: STUDIO_FRAME_CONCURRENCY + 2 }, () =>
		execution.runModel(async () => {
			running++;
			peak = Math.max(peak, running);
			await gate.promise;
			running--;
		}, new AbortController().signal),
	);
	await vi.waitFor(() => expect(running).toBe(STUDIO_FRAME_CONCURRENCY));
	gate.resolve();
	await Promise.all(tasks);
	expect(peak).toBe(STUDIO_FRAME_CONCURRENCY);
	expect(running).toBe(0);
});

it("releases a queued call on abort so worker shutdown cannot hang", async () => {
	const execution = createStudioWorkerExecution(() => {});
	const gate = Promise.withResolvers<void>();
	const occupied = Array.from({ length: STUDIO_FRAME_CONCURRENCY }, () =>
		execution.runModel(() => gate.promise, new AbortController().signal),
	);
	const shutdown = new AbortController();
	let started = false;
	const queued = execution.runModel(async () => {
		started = true;
	}, shutdown.signal);
	shutdown.abort(new Error("worker shutdown"));
	await expect(queued).rejects.toThrow("worker shutdown");
	expect(started).toBe(false);
	gate.resolve();
	await Promise.all(occupied);
	// The aborted waiter left the queue, so the freed slots are not handed to it.
	const after = await execution.runModel(
		async () => "done",
		new AbortController().signal,
	);
	expect(after).toBe("done");
});
