import { describe, expect, it } from "vitest";
import {
	type AnalysisResponse,
	AnalysisValidationError,
	buildAnalysisIdempotencyKey,
	classifyAnalysisAttemptCode,
	decideAnalysisRequest,
	resolveAnalysisScope,
} from "@/features/codebase/services/analysis";
import { resolveAnalysisCreditPolicy } from "@/features/codebase/services/analysis-credit-policy";
import {
	selectWorkspaceAnalysis,
	toWorkspaceAnalysisResponse,
} from "@/features/codebase/services/analysis-selection";
import {
	canReadExistingPlans,
	canStartPlanning,
	hasReadyAnalysisForSnapshot,
	hasUsableSnapshot,
	resolveAnalysisRecoveryCode,
	resolveCodebaseReadiness,
	resolveOnboardingReadiness,
} from "@/features/codebase/services/workspace-readiness";

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

const READY_ANALYSIS: AnalysisResponse = {
	id: "ana-ready",
	projectId: "proj-1",
	snapshotId: "snap-1",
	status: "ready",
	output: VALID_OUTPUT,
};

const upload = { id: "snap-1", status: "uploaded" };

describe("p3 recovery requirements", () => {
	it("1. upload success + analysis failed: retry keeps the snapshot, no re-upload", () => {
		// The snapshot survives the failure, so recovery is possible without the
		// CLI: readiness is recovery_required while the upload stays usable.
		expect(
			hasUsableSnapshot({ snapshotId: "snap-1", status: "uploaded" }),
		).toBe(true);
		const readiness = resolveOnboardingReadiness({
			snapshotId: "snap-1",
			snapshotStatus: "uploaded",
			analysis: null,
			analysisAttemptStatus: "failed",
		});
		expect(readiness).toBe("recovery_required");
		expect(canStartPlanning(readiness)).toBe(false);
		// Retry mints a new analysis attempt, never a new snapshot/session.
		expect(
			decideAnalysisRequest(upload, [{ id: "ana-1", status: "failed" }]),
		).toEqual({ action: "create" });
	});

	it("2. retry pins the same snapshot id", () => {
		const decision = decideAnalysisRequest(
			{ id: "snap-1", status: "uploaded" },
			[{ id: "ana-1", status: "failed" }],
		);
		expect(decision).toEqual({ action: "create" });
		// The attempt identity is bound to that exact snapshot, so a retry can
		// never drift onto another repository state.
		expect(
			buildAnalysisIdempotencyKey({
				projectId: "proj-1",
				snapshotId: "snap-1",
			}),
		).toBe("proj-1:codebase_analysis:snap-1:initial");
	});

	it("3. double click yields one effective attempt", () => {
		const pending = [{ id: "ana-pending", status: "pending" }];
		const first = decideAnalysisRequest(upload, pending);
		const second = decideAnalysisRequest(upload, pending);
		expect(first).toEqual({ action: "reuse", analysisId: "ana-pending" });
		expect(second).toEqual(first);
	});

	it("4. existing ready result is reused instead of regenerated", () => {
		expect(
			decideAnalysisRequest(upload, [{ id: "ana-ready", status: "ready" }]),
		).toEqual({ action: "reuse", analysisId: "ana-ready" });
		const readiness = resolveOnboardingReadiness({
			snapshotId: "snap-1",
			snapshotStatus: "uploaded",
			analysis: READY_ANALYSIS,
			analysisAttemptStatus: "ready",
		});
		expect(readiness).toBe("planning_ready");
	});

	it("5. pending analysis is monitored, not duplicated", () => {
		expect(
			decideAnalysisRequest(upload, [{ id: "ana-pending", status: "pending" }]),
		).toEqual({ action: "reuse", analysisId: "ana-pending" });
		expect(
			resolveOnboardingReadiness({
				snapshotId: "snap-1",
				snapshotStatus: "uploaded",
				analysis: null,
				analysisAttemptStatus: "pending",
			}),
		).toBe("analysis_pending");
	});

	it("6. insufficient credits cannot start a model attempt", () => {
		const blocked = resolveAnalysisCreditPolicy({
			allowanceUsed: true,
			allowanceInProgress: false,
			subscriptionPaused: false,
			availableCredits: 0,
			isInitial: false,
		});
		expect(blocked.code).toBe("INSUFFICIENT_CREDITS");
		expect(blocked.canStart).toBe(false);
		// Without the user's cost consent, even a fundable request stays blocked.
		expect(
			resolveAnalysisCreditPolicy({
				allowanceUsed: true,
				allowanceInProgress: false,
				subscriptionPaused: false,
				availableCredits: blocked.maximumCredits,
				isInitial: false,
			}).canStart,
		).toBe(false);
	});

	it("7. restored credit resumes from the stored snapshot", () => {
		const funded = resolveAnalysisCreditPolicy({
			allowanceUsed: true,
			allowanceInProgress: false,
			subscriptionPaused: false,
			availableCredits: 50,
			isInitial: false,
			consentMaximum: 50,
		});
		expect(funded.code).toBe("CREDIT_REQUIRED");
		expect(funded.canStart).toBe(true);
		// Resumption still targets the persisted attempt/snapshot, not a new sync.
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "failed",
				creditBlocked: false,
				errorCode: "PROVIDER_UNAVAILABLE",
			}),
		).toBe("PROVIDER_UNAVAILABLE");
	});

	it("8. a lost client response still resolves to the persisted success", () => {
		const selection = selectWorkspaceAnalysis(
			[
				{
					id: "ana-ready",
					projectId: "proj-1",
					snapshotId: "snap-1",
					status: "ready",
					output: VALID_OUTPUT,
				},
			],
			{ projectId: "proj-1", snapshotId: "snap-1" },
		);
		expect(selection.selected?.id).toBe("ana-ready");
		expect(selection.selected?.status).toBe("ready");
	});

	it("9. refresh while pending keeps monitoring the same attempt", () => {
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "pending",
			}),
		).toBe("ANALYSIS_PENDING");
		const selection = selectWorkspaceAnalysis(
			[
				{
					id: "ana-pending",
					projectId: "proj-1",
					snapshotId: "snap-1",
					status: "pending",
					createdAt: new Date("2026-01-02T00:00:00Z"),
				},
			],
			{ projectId: "proj-1", snapshotId: "snap-1" },
		);
		expect(selection.selected).toBeNull();
		expect(selection.latestAttempt).toEqual({
			id: "ana-pending",
			status: "pending",
		});
	});

	it("10. provider failure and invalid output are distinguishable", () => {
		expect(
			classifyAnalysisAttemptCode(new Error("fetch failed ECONNRESET")),
		).toBe("PROVIDER_UNAVAILABLE");
		expect(
			classifyAnalysisAttemptCode(
				new AnalysisValidationError({ reason: "invalid_json", rawLength: 1 }),
			),
		).toBe("ANALYSIS_OUTPUT_INVALID");
	});

	it("11. stale or mismatched analysis is never treated as ready", () => {
		// Ready content bound to another snapshot is not evidence about this one.
		expect(hasReadyAnalysisForSnapshot(READY_ANALYSIS, "snap-2")).toBe(false);
		// A ready row with unreadable output is dropped, not surfaced.
		expect(
			toWorkspaceAnalysisResponse({
				id: "ana-broken",
				projectId: "proj-1",
				snapshotId: "snap-1",
				status: "ready",
				output: { projectId: "proj-1" },
			}),
		).toBeNull();
	});

	it("12. cross-user access is denied", () => {
		expect(
			resolveAnalysisScope({
				projectId: "proj-1",
				projectMode: "existing_codebase",
				projectCodebaseId: "cb-1",
				projectUserId: "user-a",
				authenticatedUserId: "user-b",
				codebaseOwnerId: "user-a",
			}),
		).toEqual({ kind: "not_found" });
		expect(
			resolveAnalysisScope({
				projectId: "proj-1",
				projectMode: "existing_codebase",
				projectCodebaseId: "cb-1",
				projectUserId: "user-a",
				authenticatedUserId: "user-a",
				codebaseOwnerId: "user-b",
			}),
		).toEqual({ kind: "not_found" });
	});

	it("13. re-sync failure keeps existing plans readable", () => {
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

	it("14. retrying the same attempt reuses the operation identity (no double charge)", () => {
		const first = buildAnalysisIdempotencyKey({
			projectId: "proj-1",
			snapshotId: "snap-1",
		});
		const duplicate = buildAnalysisIdempotencyKey({
			projectId: "proj-1",
			snapshotId: "snap-1",
			refreshAnalysisId: null,
		});
		expect(duplicate).toBe(first);
		// A different snapshot or a refresh is a genuinely distinct operation.
		expect(
			buildAnalysisIdempotencyKey({
				projectId: "proj-1",
				snapshotId: "snap-2",
			}),
		).not.toBe(first);
		expect(
			buildAnalysisIdempotencyKey({
				projectId: "proj-1",
				snapshotId: "snap-1",
				refreshAnalysisId: "ana-ready",
			}),
		).not.toBe(first);
	});

	it("15. a finished retry updates workspace readiness", () => {
		expect(
			resolveOnboardingReadiness({
				snapshotId: "snap-1",
				snapshotStatus: "uploaded",
				analysis: null,
				analysisAttemptStatus: "failed",
			}),
		).toBe("recovery_required");
		expect(
			resolveOnboardingReadiness({
				snapshotId: "snap-1",
				snapshotStatus: "uploaded",
				analysis: READY_ANALYSIS,
				analysisAttemptStatus: "ready",
			}),
		).toBe("planning_ready");
	});
});
