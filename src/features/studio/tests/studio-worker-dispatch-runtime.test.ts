import assert from "node:assert/strict";
import { afterEach, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	pipeline: vi.fn<() => Promise<void>>(),
	query: vi.fn().mockResolvedValue({ rows: [{ locked: true }] }),
	release: vi.fn(),
}));
vi.mock("@/db", () => ({
	db: {
		$client: {
			connect: async () => ({ query: mocks.query, release: mocks.release }),
		},
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({
						limit: async () => [
							{
								id: "job-a",
								projectId: "project",
								userId: "owner",
								jobType: "revise",
							},
							{
								id: "job-b",
								projectId: "project",
								userId: "owner",
								jobType: "revise",
							},
						],
					}),
				}),
			}),
		}),
	},
}));
vi.mock("../services/studio-job-pipeline", () => ({
	runStudioJobPipeline: mocks.pipeline,
}));
vi.mock("../services/studio-job-lease", () => ({
	recoverStalledStudioJobs: async () => {},
}));

import { dispatchStudioWorkerBatch } from "../services/studio-worker-dispatch";

afterEach(() => vi.restoreAllMocks());
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
