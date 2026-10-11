import { describe, expect, it } from "vitest";
import {
	appendRunThinking,
	CODEBASE_STAGE_ACTIVITY,
	CODEBASE_STAGE_DONE_LABEL,
	isRunWorking,
	resetRunThinking,
	resolveResumeStage,
	runDurationSeconds,
	settleRun,
	shouldAutoRevealArtifact,
	startRun,
} from "./codebase-chat-flow";

describe("codebase run state (real request facts only)", () => {
	it("starts running with the caller's measured start and no finish time", () => {
		const run = startRun("prd", 1_000);
		expect(run.stage).toBe("prd");
		expect(run.startedAt).toBe(1_000);
		expect(run.finishedAt).toBeNull();
		expect(run.status).toBe("running");
		expect(run.thinkingText).toBe("");
		expect(isRunWorking(run)).toBe(true);
	});

	it("exposes one honest activity line per stage and never a rotating list", () => {
		const stages = ["questions", "feature", "prd", "ac", "task"] as const;
		for (const stage of stages) {
			const activity = CODEBASE_STAGE_ACTIVITY[stage];
			expect(typeof activity).toBe("string");
			expect(activity.length).toBeGreaterThan(0);
			// Every line names the real request; none claims an internal phase.
			expect(activity).not.toMatch(
				/membaca file|reading database|analyzing repository/i,
			);
		}
		expect(new Set(stages.map((s) => CODEBASE_STAGE_ACTIVITY[s])).size).toBe(
			stages.length,
		);
	});

	it("gives every stage a distinct settled label", () => {
		const labels = Object.values(CODEBASE_STAGE_DONE_LABEL);
		expect(labels.every((label) => label.length > 0)).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
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

	it("appends real streamed reasoning and clears it on a provider reset", () => {
		const run = startRun("prd", 0);
		const first = appendRunThinking(run, "menimbang");
		const second = appendRunThinking(first, " struktur");
		expect(second?.thinkingText).toBe("menimbang struktur");
		expect(resetRunThinking(second)?.thinkingText).toBe("");
	});

	it("refuses to mutate reasoning once the run settled", () => {
		const settled = settleRun(startRun("prd", 0), "done", 10);
		expect(appendRunThinking(settled, "late")).toBe(settled);
		expect(resetRunThinking(settled)).toBe(settled);
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
