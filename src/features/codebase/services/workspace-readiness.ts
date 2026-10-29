/**
 * One authoritative readiness model for an existing-codebase workspace.
 *
 * Three different facts were previously collapsed into a single boolean:
 *
 * - **Repository uploaded** — a verified snapshot is persisted. The user can
 *   see the repository and keep onboarding, but nothing can be planned.
 * - **Analysis ready** — validated model output is stored for THAT snapshot.
 *   An HTTP request finishing is not evidence; a readable, snapshot-bound
 *   record is.
 * - **Planning ready** — the two above hold, so Feature -> PRD -> AC -> Task
 *   can start on real repository context.
 *
 * Reading an already-persisted plan is a fourth capability that must survive a
 * failed re-sync: history belongs to the snapshot it was generated against, so
 * losing the current analysis never deletes it.
 */
import { type AnalysisResponse, codebaseAnalysisSchema } from "./analysis";
import {
	type AnalysisRecoveryCode,
	isAnalysisRecoveryCode,
} from "./analysis-diagnostics";
import { SNAPSHOT_CONTEXT_STATUSES } from "./sync";

export type CodebaseReadiness =
	/** No verified snapshot yet: the CLI has to finish. */
	| "onboarding"
	/** Snapshot persisted, analysis still running (or not started). */
	| "analysis_pending"
	/** Snapshot persisted, analysis failed or blocked: user must recover. */
	| "recovery_required"
	/** Snapshot + ready analysis for that snapshot: planning may start. */
	| "planning_ready"
	/** No ready analysis, but stored plans exist and stay readable. */
	| "existing_plan_readonly";

/** Validated analysis output that is bound to this exact snapshot. */
export function hasReadyAnalysisForSnapshot(
	analysis: Pick<AnalysisResponse, "snapshotId" | "status" | "output"> | null,
	snapshotId: string | null | undefined,
): boolean {
	if (!analysis || !snapshotId) return false;
	if (analysis.status !== "ready" || !analysis.output) return false;
	if (analysis.snapshotId !== snapshotId) return false;
	const parsed = codebaseAnalysisSchema.safeParse(analysis.output);
	return (
		parsed.success &&
		parsed.data.snapshotId === snapshotId &&
		Boolean(parsed.data.projectId)
	);
}

/**
 * Whether the status endpoint reports a usable snapshot for the current
 * attempt. Snapshot presence is a transport fact and says nothing about
 * analysis readiness.
 */
export function hasUsableSnapshot(
	status:
		| {
				status?: string | null;
				snapshotId?: string | null;
		  }
		| null
		| undefined,
): boolean {
	return Boolean(
		status?.snapshotId &&
			status.status &&
			SNAPSHOT_CONTEXT_STATUSES.includes(status.status),
	);
}

/**
 * Readiness for a live onboarding attempt, where the server status is the only
 * source of truth and no stored plan is being resumed.
 *
 * A pending analysis is deliberately reported as pending even when the user
 * already owns stored plans: onboarding has no plans to read yet.
 */
export function resolveOnboardingReadiness(input: {
	snapshotId: string | null | undefined;
	snapshotStatus: string | null | undefined;
	analysis: AnalysisResponse | null;
	analysisAttemptStatus?: "pending" | "ready" | "failed" | null;
	creditBlocked?: boolean;
}): CodebaseReadiness {
	return resolveCodebaseReadiness({ ...input, hasExistingPlan: false });
}

export function resolveCodebaseReadiness(input: {
	snapshotId: string | null | undefined;
	snapshotStatus: string | null | undefined;
	analysis: AnalysisResponse | null;
	/** Newest stored attempt for the same snapshot, when the server reports it. */
	analysisAttemptStatus?: "pending" | "ready" | "failed" | null;
	/** The repository already holds persisted planning artifacts. */
	hasExistingPlan?: boolean;
	/** A verified snapshot is stored in the database for this codebase. */
	hasStoredSnapshot?: boolean;
	/**
	 * Billing/eligibility preflight blocked the attempt. This is a distinct
	 * terminal-for-now state: nothing is running, so it must never be reported
	 * as an analysis still in progress.
	 */
	creditBlocked?: boolean;
}): CodebaseReadiness {
	const {
		snapshotId,
		snapshotStatus,
		analysis,
		analysisAttemptStatus,
		hasExistingPlan,
		hasStoredSnapshot,
		creditBlocked,
	} = input;
	const hasSnapshot =
		Boolean(hasStoredSnapshot) ||
		(Boolean(snapshotId) &&
			Boolean(snapshotStatus) &&
			SNAPSHOT_CONTEXT_STATUSES.includes(snapshotStatus as string));
	if (!hasSnapshot) return "onboarding";
	if (hasReadyAnalysisForSnapshot(analysis, snapshotId))
		return "planning_ready";
	// One decision path for every recovery state: the canonical code is the
	// source of truth, and readiness only maps it to what the surface may do.
	const recovery = resolveAnalysisRecoveryCode({
		snapshotReady: true,
		attemptStatus: analysisAttemptStatus ?? analysis?.status ?? null,
		analysisReady: false,
		errorCode: analysis?.errorCode ?? null,
		creditBlocked,
	});
	const notStarted =
		recovery === "ANALYSIS_PENDING" || recovery === "ANALYSIS_NOT_STARTED";
	if (hasExistingPlan) return "existing_plan_readonly";
	return notStarted ? "analysis_pending" : "recovery_required";
}

/**
 * Project the current persisted facts onto the canonical recovery vocabulary
 * (Phase 03 Section E). `null` means nothing needs recovering: validated
 * analysis for this snapshot exists.
 *
 * Ordering encodes two invariants: a usable ready result survives a newer
 * failed or pending attempt (Section G), and a billing block is never reported
 * as an in-flight analysis (Sections A and D).
 */
export function resolveAnalysisRecoveryCode(input: {
	snapshotReady: boolean;
	attemptStatus?: "pending" | "ready" | "failed" | null;
	analysisReady?: boolean;
	errorCode?: string | null;
	creditBlocked?: boolean;
}): AnalysisRecoveryCode | null {
	const {
		snapshotReady,
		attemptStatus,
		analysisReady,
		errorCode,
		creditBlocked,
	} = input;
	if (!snapshotReady) return "SNAPSHOT_INCOMPLETE";
	if (analysisReady || attemptStatus === "ready") return null;
	if (creditBlocked) return "CREDIT_REQUIRED";
	if (attemptStatus === "pending") return "ANALYSIS_PENDING";
	if (attemptStatus === "failed") {
		if (errorCode === "ANALYSIS_OUTPUT_INVALID")
			return "ANALYSIS_OUTPUT_INVALID";
		if (errorCode === "PROVIDER_UNAVAILABLE") return "PROVIDER_UNAVAILABLE";
		return isAnalysisRecoveryCode(errorCode) ? errorCode : "ANALYSIS_FAILED";
	}
	return "ANALYSIS_NOT_STARTED";
}

/** Only a ready analysis unlocks new planning work. */
export function canStartPlanning(readiness: CodebaseReadiness): boolean {
	return readiness === "planning_ready";
}

/** Stored plans stay readable even when the current snapshot is not ready. */
export function canReadExistingPlans(readiness: CodebaseReadiness): boolean {
	return (
		readiness === "planning_ready" || readiness === "existing_plan_readonly"
	);
}
