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
