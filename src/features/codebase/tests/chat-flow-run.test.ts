import { describe, expect, it } from "vitest";
import {
	attemptStartEpoch,
	CODEBASE_STAGE_DONE_LABEL,
	isRunActive,
	isRunWorking,
	observeOperation,
	queueRun,
	reconcilePipelineStage,
	resolvePersistedStage,
	resolveResumeStage,
	runDurationSeconds,
	settleRun,
	settleRunForOperation,
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
		expect(run.operationId).toBeNull();
		expect(run.attempt).toBe(0);
		expect(run.error).toBeNull();
		expect(isRunWorking(run)).toBe(true);
		expect(isRunActive(run)).toBe(true);
	});

	it("carries no phase, activity log or reasoning field to render", () => {
		const run = startRun("questions", 1_000);
		expect(Object.keys(run).sort()).toEqual([
			"attempt",
			"error",
			"finishedAt",
			"operationId",
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

	it("starts a queued run with no attempt clock at all", () => {
		const run = queueRun("questions");
		expect(run.status).toBe("queued");
		expect(run.startedAt).toBeNull();
		expect(run.finishedAt).toBeNull();
		expect(isRunWorking(run)).toBe(false);
		expect(isRunActive(run)).toBe(true);
		expect(runDurationSeconds(run)).toBeNull();
	});

	it("opens the attempt clock when the worker really claims the operation", () => {
		const queued = queueRun("questions");
		const observed = observeOperation(queued, {
			id: "op-1",
			stage: "questions",
			status: "running",
			attempt: 1,
			createdAt: new Date(1_000).toISOString(),
			startedAt: new Date(1_600).toISOString(),
		});
		// The attempt's own start, never the operation's creation time.
		expect(observed?.startedAt).toBe(1_600);
		expect(observed?.attempt).toBe(1);
		expect(observed?.operationId).toBe("op-1");
		expect(observed?.status).toBe("running");
	});

	it("resets the attempt timing on a retry instead of inheriting the previous attempt", () => {
		const firstAttempt = observeOperation(queueRun("questions"), {
			id: "op-1",
			stage: "questions",
			status: "running",
			attempt: 1,
			createdAt: new Date(1_000).toISOString(),
			startedAt: new Date(1_600).toISOString(),
		});
		const failed = settleRunForOperation(
			firstAttempt,
			{ id: "op-1", stage: "questions", status: "failed", attempt: 1 },
			"failed",
			44_600,
			"Generasi terhenti.",
		);
		expect(runDurationSeconds(failed)).toBe(43);

		// The user clicks "Coba lagi": the same operation is re-queued, then claimed
		// again at a later time.
		const retried = queueRun("questions");
		const requeued = observeOperation(retried, {
			id: "op-1",
			stage: "questions",
			status: "queued",
			attempt: 1,
		});
		expect(requeued?.startedAt).toBeNull();
		const secondAttempt = observeOperation(requeued, {
			id: "op-1",
			stage: "questions",
			status: "running",
			attempt: 2,
			createdAt: new Date(1_000).toISOString(),
			startedAt: new Date(90_000).toISOString(),
		});
		expect(secondAttempt?.startedAt).toBe(90_000);
		expect(secondAttempt?.attempt).toBe(2);
		// Nothing of the first attempt's 43s leaks into the retry.
		expect(runDurationSeconds(secondAttempt)).toBeNull();
	});

	it("never moves a settled run, or one owned by another operation or attempt", () => {
		const settled = settleRun(startRun("prd", 1_000), "done", 5_000);
		const snapshot = {
			id: "op-1",
			stage: "prd" as const,
			status: "running" as const,
			attempt: 1,
			startedAt: new Date(1_600).toISOString(),
		};
		expect(observeOperation(settled, snapshot)).toBe(settled);

		const run = observeOperation(queueRun("prd"), snapshot);
		expect(
			observeOperation(run, { ...snapshot, id: "op-other", attempt: 3 }),
		).toBe(run);
		expect(observeOperation(run, { ...snapshot, attempt: 0 })).toBe(run);
		expect(observeOperation(run, { ...snapshot, stage: "ac" })).toBe(run);
		expect(observeOperation(null, snapshot)).toBeNull();
	});

	it("refuses to settle a run with an older attempt's callback", () => {
		const run = observeOperation(queueRun("task"), {
			id: "op-1",
			stage: "task",
			status: "running",
			attempt: 2,
			startedAt: new Date(2_000).toISOString(),
		});

		const stale = settleRunForOperation(
			run,
			{ id: "op-1", stage: "task", status: "failed", attempt: 1 },
			"failed",
			9_000,
			"late failure from attempt 1",
		);
		expect(stale?.status).toBe("running");
		expect(stale?.startedAt).toBe(2_000);

		const own = settleRunForOperation(
			run,
			{ id: "op-1", stage: "task", status: "completed", attempt: 2 },
			"done",
			4_000,
		);
		expect(own?.status).toBe("done");
		expect(runDurationSeconds(own)).toBe(2);
	});

	it("reads the attempt start, never the operation's creation time", () => {
		expect(
			attemptStartEpoch({
				status: "running",
				createdAt: new Date(2_000).toISOString(),
				startedAt: new Date(3_000).toISOString(),
			}),
		).toBe(3_000);
		expect(
			attemptStartEpoch({
				status: "queued",
				createdAt: new Date(2_000).toISOString(),
				startedAt: null,
			}),
		).toBeNull();
		// Legacy rows written before attempt timestamps existed only have their
		// creation time, which is the only acceptance they recorded.
		expect(
			attemptStartEpoch({
				status: "completed",
				createdAt: new Date(2_000).toISOString(),
				startedAt: null,
			}),
		).toBe(2_000);
		expect(
			attemptStartEpoch({
				status: "running",
				createdAt: null,
				startedAt: null,
			}),
		).toBeNull();
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

	it("settles a queued run whose attempt the client never observed", () => {
		// An operation can complete without the client ever seeing it run (artifact
		// adopted or reconciled after a reconnect): the queue settles, and it reports
		// no duration because no attempt clock was ever recorded for it.
		const settled = settleRun(queueRun("prd"), "done", 9_000);
		expect(settled?.status).toBe("done");
		expect(settled?.finishedAt).toBe(9_000);
		expect(runDurationSeconds(settled)).toBeNull();
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
