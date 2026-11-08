import { describe, expect, it, vi } from "vitest";
import {
	anchorRunStart,
	CODEBASE_STAGE_DONE_LABEL,
	isRunWorking,
	operationStartEpoch,
	reconcilePipelineStage,
	resolvePersistedStage,
	resolveResumeStage,
	runDurationSeconds,
	settleRun,
	settleRunIfCurrent,
	shouldAutoRevealArtifact,
	startRun,
} from "@/features/codebase/services/chat-flow";

describe("codebase run state (real request facts only)", () => {
	it("starts running with the caller's measured start and no finish time", () => {
		const run = startRun("prd", 1_000);
		expect(run.stage).toBe("prd");
		expect(run.startedAt).toBe(1_000);
		expect(run.finishedAt).toBeNull();
		expect(run.status).toBe("running");
		expect(run.error).toBeNull();
		expect(isRunWorking(run)).toBe(true);
	});

	it("carries no phase, activity log or reasoning field to render", () => {
		const run = startRun("questions", 1_000);
		expect(Object.keys(run).sort()).toEqual([
			"error",
			"finishedAt",
			"requestId",
			"stage",
			"startedAt",
			"status",
		]);
	});

	it("publishes exactly the approved settled label per stage", () => {
		expect(CODEBASE_STAGE_DONE_LABEL).toEqual({
			questions: "Pertanyaan siap",
			feature: "Spesifikasi fitur siap",
			prd: "PRD siap",
			ac: "Acceptance criteria siap",
			task: "Task siap",
		});
	});

	it("re-anchors a running request on the server's acceptance time", () => {
		const run = startRun("prd", 1_000);
		const accepted = new Date(1_600).toISOString();

		const anchored = anchorRunStart(run, accepted, run.requestId);
		expect(anchored?.startedAt).toBe(1_600);
		// Re-anchoring does not restart the run or move its identity.
		expect(anchored?.requestId).toBe(run.requestId);
		expect(anchored?.status).toBe("running");
	});

	it("never moves the clock for a settled run, a foreign request, or junk input", () => {
		const settled = settleRun(startRun("prd", 1_000), "done", 5_000);
		const accepted = new Date(1_600).toISOString();
		expect(anchorRunStart(settled, accepted, settled?.requestId)).toBe(settled);

		const run = startRun("prd", 1_000);
		expect(anchorRunStart(run, accepted, "run-other-1")).toBe(run);
		expect(anchorRunStart(run, "not-a-date", run.requestId)).toBe(run);
		expect(anchorRunStart(run, null, run.requestId)).toBe(run);
	});

	it("prefers the acceptance timestamp and falls back to the worker start", () => {
		vi.spyOn(Date, "now").mockReturnValue(9_000_000);
		expect(
			operationStartEpoch({
				createdAt: new Date(2_000).toISOString(),
				startedAt: new Date(3_000).toISOString(),
			}),
		).toBe(2_000);
		expect(
			operationStartEpoch({
				createdAt: null,
				startedAt: new Date(3_000).toISOString(),
			}),
		).toBe(3_000);
		expect(operationStartEpoch({ createdAt: "junk", startedAt: null })).toBe(
			9_000_000,
		);
	});

	it("records the real measured duration only after settling", () => {
		const run = startRun("ac", 2_000);
		expect(runDurationSeconds(run)).toBeNull();
		const done = settleRun(run, "done", 20_400);
		expect(runDurationSeconds(done)).toBeCloseTo(18.4, 5);
	});

	it("ignores a second settle so a late callback cannot rewrite the outcome", () => {
		const run = startRun("task", 0);
		const done = settleRun(run, "done", 5_000);
		const failed = settleRun(done, "failed", 90_000);
		expect(failed?.status).toBe("done");
		expect(failed?.finishedAt).toBe(5_000);
	});

	it("never settles a run that was never started", () => {
		expect(settleRun(null, "done", 1)).toBeNull();
		expect(isRunWorking(null)).toBe(false);
		expect(runDurationSeconds(null)).toBeNull();
	});

	it("keeps a late settle from a previous request away from the current run", () => {
		const current = startRun("prd", 2_000);
		const earlier = startRun("questions", 1_000);

		expect(
			settleRunIfCurrent(
				current,
				earlier.requestId,
				"failed",
				3_000,
				"late failure from the previous request",
			),
		).toBe(current);
		expect(
			settleRunIfCurrent(current, current.requestId, "done", 4_000)?.status,
		).toBe("done");
	});
});

describe("automatic artifact reveal", () => {
	it("reveals only when the artifact is confirmed persisted", () => {
		expect(
			shouldAutoRevealArtifact({ persisted: true, userTookOverCanvas: false }),
		).toBe(true);
		// A request that returned 200 without a persisted artifact must not open
		// the panel: the reveal would be based on an assumption, not a fact.
		expect(
			shouldAutoRevealArtifact({ persisted: false, userTookOverCanvas: false }),
		).toBe(false);
	});

	it("never steals the panel from a user who took it over", () => {
		expect(
			shouldAutoRevealArtifact({ persisted: true, userTookOverCanvas: true }),
		).toBe(false);
		expect(
			shouldAutoRevealArtifact({ persisted: false, userTookOverCanvas: true }),
		).toBe(false);
	});
});

describe("resume stage after refresh", () => {
	it("resumes at the furthest persisted artifact", () => {
		expect(
			resolveResumeStage({
				hasFeatureTree: true,
				hasPrd: true,
				hasAc: true,
				hasTasks: true,
			}),
		).toBe("handoff");
		expect(
			resolveResumeStage({
				hasFeatureTree: true,
				hasPrd: true,
				hasAc: true,
				hasTasks: false,
			}),
		).toBe("ac");
		expect(
			resolveResumeStage({
				hasFeatureTree: true,
				hasPrd: true,
				hasAc: false,
				hasTasks: false,
			}),
		).toBe("prd");
		expect(
			resolveResumeStage({
				hasFeatureTree: true,
				hasPrd: false,
				hasAc: false,
				hasTasks: false,
			}),
		).toBe("feature");
	});

	it("starts at the question stage before any artifact exists", () => {
		expect(
			resolveResumeStage({
				hasFeatureTree: false,
				hasPrd: false,
				hasAc: false,
				hasTasks: false,
			}),
		).toBe("questions");
	});

	it("never rewinds to an earlier artifact that also still exists", () => {
		// A finished plan keeps its earlier documents readable; reopening must
		// resume at Task, not at the feature tree that is still on disk.
		const stage = resolveResumeStage({
			hasFeatureTree: true,
			hasPrd: true,
			hasAc: true,
			hasTasks: true,
		});
		expect(stage).not.toBe("feature");
		expect(stage).not.toBe("prd");
		expect(stage).not.toBe("ac");
	});
});

describe("authoritative stage from persisted hydration", () => {
	it("resolves PRD-only to the prd stage", () => {
		expect(
			resolvePersistedStage({
				feature: "ready",
				prd: "ready",
				ac: "empty",
				tasks: "empty",
			}),
		).toBe("prd");
	});

	it("resolves PRD + AC to the ac stage", () => {
		expect(
			resolvePersistedStage({
				feature: "ready",
				prd: "ready",
				ac: "ready",
				tasks: "empty",
			}),
		).toBe("ac");
	});

	it("resolves a full task plan to handoff", () => {
		expect(
			resolvePersistedStage({
				feature: "ready",
				prd: "ready",
				ac: "ready",
				tasks: "ready",
			}),
		).toBe("handoff");
	});

	it("treats a ready task list as handoff even when PRD failed to read", () => {
		// The reported bug's worst case: tasks exist, but another artifact read
		// failed. The stage must still be the furthest one proven.
		expect(
			resolvePersistedStage({
				feature: "ready",
				prd: "failed",
				ac: "failed",
				tasks: "ready",
			}),
		).toBe("handoff");
	});

	it("never advances on a pending or failed read", () => {
		expect(
			resolvePersistedStage({
				feature: "pending",
				prd: "pending",
				ac: "failed",
				tasks: "pending",
			}),
		).toBe("questions");
	});

	it("never mistakes a missing artifact for a failed one", () => {
		// `empty` is a proven absence; `failed` and `pending` are unknown. All
		// three keep the stage at questions rather than assuming content.
		expect(
			resolvePersistedStage({
				feature: "empty",
				prd: "empty",
				ac: "empty",
				tasks: "empty",
			}),
		).toBe("questions");
		expect(
			resolvePersistedStage({
				feature: null,
				prd: undefined,
				ac: "failed",
				tasks: "empty",
			}),
		).toBe("questions");
	});
});

describe("monotonic pipeline stage reconciliation", () => {
	it("catches up to the furthest persisted stage regardless of arrival order", () => {
		// The exact race from the report: a fast feature read latches `feature`,
		// then a slow task read proves `handoff`.
		const afterFeatureRead = reconcilePipelineStage("questions", "feature");
		expect(afterFeatureRead).toBe("feature");
		expect(reconcilePipelineStage(afterFeatureRead, "handoff")).toBe("handoff");
	});

	it("never rewinds when an earlier stage arrives late", () => {
		expect(reconcilePipelineStage("handoff", "ac")).toBe("handoff");
		expect(reconcilePipelineStage("handoff", "questions")).toBe("handoff");
		expect(reconcilePipelineStage("ac", "prd")).toBe("ac");
	});

	it("keeps the visible stage when the persisted stage is not proven", () => {
		expect(reconcilePipelineStage("prd", "questions")).toBe("prd");
		expect(reconcilePipelineStage("questions", "questions")).toBe("questions");
	});

	it("treats task and handoff as the same terminal rank", () => {
		expect(reconcilePipelineStage("task", "handoff")).toBe("task");
		expect(reconcilePipelineStage("handoff", "task")).toBe("handoff");
	});

	it("is idempotent for a repeated identical stage", () => {
		for (const stage of [
			"questions",
			"feature",
			"prd",
			"ac",
			"handoff",
		] as const) {
			expect(reconcilePipelineStage(stage, stage)).toBe(stage);
		}
	});
});
