import assert from "node:assert/strict";
import { afterEach, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	pipeline: vi.fn<() => Promise<void>>(),
	query: vi.fn().mockResolvedValue({ rows: [{ locked: true }] }),
	release: vi.fn(),
	jobs: [
		{ id: "job-a", projectId: "project", userId: "owner", jobType: "revise" },
		{ id: "job-b", projectId: "project", userId: "owner", jobType: "revise" },
	],
}));
vi.mock("@/db", () => ({
	db: {
		$client: {
			connect: async () => ({
				query: mocks.query,
				release: mocks.release,
				on: () => {},
				off: () => {},
			}),
		},
	},
}));
vi.mock("../services/studio-job-pipeline", () => ({
	runStudioJobPipeline: mocks.pipeline,
}));
vi.mock("../services/studio-job-lease", () => ({
	recoverStalledStudioJobs: async () => {},
	STUDIO_WORKER_POLL_MS: 2000,
}));
// The queue is drained once: a second call must report nothing runnable, which
// is what lets the dispatcher settle instead of redispatching finished work.
vi.mock("../services/studio-job-dependencies", () => ({
	listRunnableStudioJobs: async () =>
		mocks.jobs.length ? mocks.jobs.splice(0) : [],
}));

import { dispatchStudioWorkerBatch } from "../services/studio-worker-dispatch";

afterEach(() => {
	vi.restoreAllMocks();
	mocks.jobs = [
		{ id: "job-a", projectId: "project", userId: "owner", jobType: "revise" },
		{ id: "job-b", projectId: "project", userId: "owner", jobType: "revise" },
	];
});
it("settles concurrent jobs, retains secure rejection diagnostics and releases the lock", async () => {
	let active = 0;
	let peak = 0;
	mocks.pipeline.mockImplementation(async () => {
		peak = Math.max(peak, ++active);
		await new Promise((resolve) => setTimeout(resolve, 5));
		active--;
		throw Object.assign(new Error("private provider payload"), {
			code: "ECONNRESET",
		});
	});
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	assert.equal(await dispatchStudioWorkerBatch(), 2);
	assert.equal(peak, 2);
	assert.equal(active, 0);
	assert.equal(mocks.release.mock.calls.length, 1);
	assert.ok(
		mocks.query.mock.calls.some(([sql]) => sql.includes("pg_advisory_unlock")),
	);
	assert.equal(log.mock.calls.length, 2);
	assert.ok(JSON.stringify(log.mock.calls).includes("ECONNRESET"));
	assert.ok(
		!JSON.stringify(log.mock.calls).includes("private provider payload"),
	);
});
