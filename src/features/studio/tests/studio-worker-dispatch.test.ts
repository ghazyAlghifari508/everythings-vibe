import { expect, it } from "vitest";
import { selectStudioWorkerBatch } from "../services/studio-worker-dispatch";

it("reserves all three frame slots for an initial job", () => {
	const jobs = [{ jobType: "initial" }, { jobType: "revise" }];
	expect(selectStudioWorkerBatch(jobs)).toEqual([jobs[0]]);
});
it("bounds single-frame operations to three without overtaking an initial job", () => {
	const jobs = Array.from({ length: 5 }, () => ({ jobType: "revise" }));
	expect(selectStudioWorkerBatch(jobs)).toHaveLength(3);
	expect(
		selectStudioWorkerBatch([jobs[0], { jobType: "initial" }, jobs[1]]),
	).toEqual([jobs[0]]);
	expect(selectStudioWorkerBatch([])).toEqual([]);
});
it("lets dependent work fill spare slots only while an initial job already runs", () => {
	const queued = [
		{ jobType: "revise", id: "a" },
		{ jobType: "initial", id: "b" },
		{ jobType: "add", id: "c" },
	];
	// Jobs queued before an initial job are admitted first, then the initial job
	// reserves the batch alone so its frames are not interleaved with strangers.
	expect(selectStudioWorkerBatch(queued)).toEqual([queued[0]]);
	// While an initial job is running its frames hold the slots, so the remaining
	// non-initial jobs are admitted up to the same aggregate ceiling.
	expect(
		selectStudioWorkerBatch(
			queued.filter((job) => job.jobType !== "initial"),
			true,
		),
	).toHaveLength(2);
	expect(
		selectStudioWorkerBatch([{ jobType: "initial", id: "d" }], true),
	).toEqual([]);
});
