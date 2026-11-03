import { describe, expect, it } from "vitest";
import type { AnalysisResponse } from "../services/analysis";
import {
	canReadExistingPlans,
	canStartPlanning,
	hasReadyAnalysisForSnapshot,
	hasUsableSnapshot,
	resolveCodebaseReadiness,
	resolveOnboardingReadiness,
} from "../services/workspace-readiness";

const VALID_OUTPUT = {
	projectId: "proj-1",
	snapshotId: "snap-1",
	summary: "Aplikasi existing.",
	framework: "Next.js",
	language: "TypeScript",
	packageManager: "pnpm",
	dependencies: ["react"],
	moduleMap: [{ path: "src/app", summary: "App router" }],
	relevantFiles: ["src/app/page.tsx"],
	impactAreas: ["src/app"],
	limitations: [],
	findings: [],
};

const VALID_ANALYSIS: AnalysisResponse = {
	id: "ana-1",
	projectId: "proj-1",
	snapshotId: "snap-1",
	status: "ready",
	output: VALID_OUTPUT,
};

describe("workspace readiness - hasReadyAnalysisForSnapshot", () => {
	it("returns false when analysis is null or snapshotId is null", () => {
		expect(hasReadyAnalysisForSnapshot(null, "snap-1")).toBe(false);
		expect(hasReadyAnalysisForSnapshot(VALID_ANALYSIS, null)).toBe(false);
		expect(hasReadyAnalysisForSnapshot(null, null)).toBe(false);
	});

	it("returns false when analysis status is not ready", () => {
		expect(
			hasReadyAnalysisForSnapshot(
				{ ...VALID_ANALYSIS, status: "pending" },
				"snap-1",
			),
		).toBe(false);
		expect(
			hasReadyAnalysisForSnapshot(
				{ ...VALID_ANALYSIS, status: "failed" },
				"snap-1",
			),
		).toBe(false);
	});

	it("returns false when analysis belongs to older snapshot (Snapshot 1 vs Snapshot 2)", () => {
		// Critical test: Snapshot 2 must never use Snapshot 1 analysis
		expect(hasReadyAnalysisForSnapshot(VALID_ANALYSIS, "snap-2")).toBe(false);
	});

	it("returns false when output is missing or invalid schema", () => {
		expect(
			hasReadyAnalysisForSnapshot(
				{ ...VALID_ANALYSIS, output: null },
				"snap-1",
			),
		).toBe(false);
		expect(
			hasReadyAnalysisForSnapshot(
				{
					...VALID_ANALYSIS,
					output: { ...VALID_OUTPUT, snapshotId: "snap-mismatch" },
				},
				"snap-1",
			),
		).toBe(false);
	});

	it("returns true when analysis is ready with valid output matching snapshot", () => {
		expect(hasReadyAnalysisForSnapshot(VALID_ANALYSIS, "snap-1")).toBe(true);
	});
});

describe("workspace readiness - onboarding gating (p2.md Section 4 & 5)", () => {
	it("1. Upload success + analysis pending -> workspace belum terbuka", () => {
		const readiness = resolveOnboardingReadiness({
			snapshotId: "snap-1",
			snapshotStatus: "uploaded",
			analysis: null,
			analysisAttemptStatus: "pending",
		});
		expect(readiness).toBe("analysis_pending");
		expect(canStartPlanning(readiness)).toBe(false);
		expect(canReadExistingPlans(readiness)).toBe(false);
	});

	it("2. Upload success + analysis failed -> recovery screen", () => {
		const readiness = resolveOnboardingReadiness({
			snapshotId: "snap-1",
			snapshotStatus: "uploaded",
			analysis: null,
			analysisAttemptStatus: "failed",
		});
		expect(readiness).toBe("recovery_required");
		expect(canStartPlanning(readiness)).toBe(false);
		expect(canReadExistingPlans(readiness)).toBe(false);
	});

	it("3. Valid ready analysis on active snapshot -> workspace can open", () => {
		const readiness = resolveOnboardingReadiness({
			snapshotId: "snap-1",
			snapshotStatus: "uploaded",
			analysis: VALID_ANALYSIS,
			analysisAttemptStatus: "ready",
		});
		expect(readiness).toBe("planning_ready");
		expect(canStartPlanning(readiness)).toBe(true);
		expect(canReadExistingPlans(readiness)).toBe(true);
	});

	it("4. No snapshot -> onboarding", () => {
		const readiness = resolveOnboardingReadiness({
			snapshotId: null,
			snapshotStatus: null,
			analysis: null,
		});
		expect(readiness).toBe("onboarding");
		expect(canStartPlanning(readiness)).toBe(false);
		expect(canReadExistingPlans(readiness)).toBe(false);
	});
});

describe("workspace readiness - existing plans edge case (p2.md Section 7)", () => {
	it("preserves read access to existing plans when re-sync analysis fails", () => {
		const readiness = resolveCodebaseReadiness({
			snapshotId: "snap-2",
			snapshotStatus: "uploaded",
			analysis: null,
			analysisAttemptStatus: "failed",
			hasExistingPlan: true,
			hasStoredSnapshot: true,
		});
		expect(readiness).toBe("existing_plan_readonly");
		expect(canReadExistingPlans(readiness)).toBe(true);
		expect(canStartPlanning(readiness)).toBe(false);
	});

	it("preserves read access to existing plans when re-sync analysis is pending", () => {
		const readiness = resolveCodebaseReadiness({
			snapshotId: "snap-2",
			snapshotStatus: "uploaded",
			analysis: null,
			analysisAttemptStatus: "pending",
			hasExistingPlan: true,
			hasStoredSnapshot: true,
		});
		expect(readiness).toBe("existing_plan_readonly");
		expect(canReadExistingPlans(readiness)).toBe(true);
		expect(canStartPlanning(readiness)).toBe(false);
	});

	it("transitions to planning_ready once re-sync analysis succeeds", () => {
		const analysisSnap2: AnalysisResponse = {
			...VALID_ANALYSIS,
			id: "ana-2",
			snapshotId: "snap-2",
			output: { ...VALID_OUTPUT, snapshotId: "snap-2" },
		};
		const readiness = resolveCodebaseReadiness({
			snapshotId: "snap-2",
			snapshotStatus: "uploaded",
			analysis: analysisSnap2,
			analysisAttemptStatus: "ready",
			hasExistingPlan: true,
			hasStoredSnapshot: true,
		});
		expect(readiness).toBe("planning_ready");
		expect(canReadExistingPlans(readiness)).toBe(true);
		expect(canStartPlanning(readiness)).toBe(true);
	});

	it("recognizes snapshot from database even when sync session is expired", () => {
		const readiness = resolveCodebaseReadiness({
			snapshotId: "snap-stored",
			snapshotStatus: "expired",
			analysis: null,
			hasExistingPlan: true,
			hasStoredSnapshot: true,
		});
		expect(readiness).toBe("existing_plan_readonly");
		expect(canReadExistingPlans(readiness)).toBe(true);
	});
});

describe("workspace readiness - hasUsableSnapshot helper", () => {
	it("returns true for uploaded or ready snapshot statuses", () => {
		expect(hasUsableSnapshot({ snapshotId: "s1", status: "uploaded" })).toBe(
			true,
		);
		expect(hasUsableSnapshot({ snapshotId: "s1", status: "ready" })).toBe(true);
	});

	it("returns false for expired, failed, or missing snapshot", () => {
		expect(hasUsableSnapshot({ snapshotId: "s1", status: "expired" })).toBe(
			false,
		);
		expect(hasUsableSnapshot({ snapshotId: "s1", status: "failed" })).toBe(
			false,
		);
		expect(hasUsableSnapshot(null)).toBe(false);
		expect(hasUsableSnapshot({ snapshotId: null, status: "uploaded" })).toBe(
			false,
		);
	});
});
