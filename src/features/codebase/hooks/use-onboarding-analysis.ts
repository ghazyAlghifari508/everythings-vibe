import { useCallback, useEffect, useRef } from "react";
import {
	canContinueToCodebaseConclusion,
	ONBOARDING_FEATURE_MESSAGE,
} from "@/features/codebase/services/analysis";
import { isProvisionalCodebaseName } from "@/features/codebase/services/naming";
import {
	readPlanCodebaseProjectPointer,
	storePlanCodebaseProjectPointer,
} from "@/features/codebase/services/plan-storage";
import {
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import {
	redirectToLogin,
	requestFeatureProject,
	requestOnboardingAnalysis,
} from "../services/onboarding-requests";
import type { OnboardingAnalysisState } from "./use-onboarding-analysis-state";

/**
 * The onboarding analysis trigger, read effect, and the user-triggered retries.
 *
 * Everything here needs the polled status, so it runs after the onboarding
 * session machine has produced one. Nothing here polls: the single
 * reconciliation loop belongs to `useCodebaseOnboarding`.
 */
export function useOnboardingAnalysis({
	state,
	codebase,
	lastStatus,
	reviewReady,
}: {
	state: OnboardingAnalysisState;
	codebase: { id: string; name: string } | null;
	lastStatus: SyncStatusResponse | null;
	reviewReady: boolean;
}) {
	const {
		featureProjectId,
		setFeatureProjectId,
		analysis,
		setAnalysis,
		setAnalysisWorking,
		setAnalysisError,
		setCreditStatus,
		analysisAttemptedFor,
		fetchAnalysisOutput,
	} = state;
	const analysisRequestGeneration = useRef(0);
	// The working flag lives in shared state, but the retry guard runs inside
	// a callback: a ref mirror keeps the guard synchronous so a double click
	// in the same tick still resolves to one attempt.
	const analysisWorkingRef = useRef(state.analysisWorking);
	analysisWorkingRef.current = state.analysisWorking;

	// Ensure the single onboarding analysis project for this codebase via the
	// existing features boundary. The stored pointer is reused so refresh and
	// remount never mint duplicate projects; the server still owns validation
	// (CODEBASE_NOT_SYNCED races surface as an honest error below).
	const ensureFeatureProject = useCallback(
		async (
			codebaseId: string,
			fallbackName: string,
		): Promise<string | null> => {
			const stored = readPlanCodebaseProjectPointer();
			if (stored) {
				setFeatureProjectId(stored);
				return stored;
			}
			// A provisional creation name is storage-only: it must never be sent
			// as the feature message, or the analysis would read the placeholder
			// as user intent. The neutral onboarding intent asks for an initial
			// repository summary instead.
			const trimmed = fallbackName.trim();
			const message =
				trimmed.length >= 3 && !isProvisionalCodebaseName(trimmed)
					? trimmed
					: ONBOARDING_FEATURE_MESSAGE;
			try {
				const outcome = await requestFeatureProject(codebaseId, message);
				if (outcome.kind === "unauthorized") return null;
				if (outcome.kind === "rejected") {
					setAnalysisError(outcome.message);
					return null;
				}
				storePlanCodebaseProjectPointer(outcome.projectId);
				setFeatureProjectId(outcome.projectId);
				return outcome.projectId;
			} catch {
				setAnalysisError("Server tidak dapat dihubungi.");
				return null;
			}
		},
		[setAnalysisError, setFeatureProjectId],
	);

	// Run the real per-feature analysis through the existing trigger boundary.
	// The call is synchronous server-side (model thinking included) and
	// idempotent: a pending or ready row is reused, only failure mints a new
	// attempt. Credit and validation failures surface as honest errors, never
	// as fabricated output.
	const triggerOnboardingAnalysis = useCallback(
		async (
			projectId: string,
			snapshotId: string,
			refreshStarterSuggestionsForAnalysisId?: string,
			confirmCredit = false,
		): Promise<void> => {
			const generation = ++analysisRequestGeneration.current;
			setAnalysisWorking(true);
			setAnalysisError(null);
			setCreditStatus(null);
			try {
				const outcome = await requestOnboardingAnalysis({
					projectId,
					snapshotId,
					refreshStarterSuggestionsForAnalysisId,
					confirmCredit,
				});
				if (generation !== analysisRequestGeneration.current) return;
				if (outcome.kind === "unauthorized") {
					setAnalysisWorking(false);
					redirectToLogin();
					return;
				}
				if (outcome.kind === "mismatch") {
					setAnalysisWorking(false);
					return;
				}
				if (outcome.kind === "credit") {
					// A credit block is definitive, not pending: clear the local
					// working and retry paint so the billing action owns the row.
					setAnalysisWorking(false);
					setCreditStatus(outcome.status ?? null);
					if (!outcome.status) setAnalysisError(outcome.message);
					return;
				}
				if (outcome.kind === "failed") {
					setAnalysisWorking(false);
					setAnalysisError(outcome.message);
					return;
				}
				setAnalysis(outcome.analysis);
			} catch {
				if (generation === analysisRequestGeneration.current) {
					setAnalysisError("Server tidak dapat dihubungi.");
				}
			} finally {
				if (generation === analysisRequestGeneration.current) {
					setAnalysisWorking(false);
				}
			}
		},
		[setAnalysis, setAnalysisError, setAnalysisWorking, setCreditStatus],
	);

	// Retry resets the per-snapshot guard and clears the previous attempt, then
	// triggers analysis directly. The retry flag (not a timeout) owns the
	// immediate running paint, and it is cleared by the real resolution:
	// ready output, a new failure, or a definitive trigger error.
	// Double click is a no-op: the generation guard plus the in-flight working
	// flag make the second click resolve to the same attempt.
	const retryAnalysis = useCallback(() => {
		if (!featureProjectId || !lastStatus?.snapshotId) return;
		if (analysisWorkingRef.current) return;
		analysisAttemptedFor.current = lastStatus.snapshotId;
		setCreditStatus(null);
		setAnalysisWorking(true, { retrying: true });
		setAnalysis(null);
		setAnalysisError(null);
		void triggerOnboardingAnalysis(
			featureProjectId,
			lastStatus.snapshotId,
			undefined,
			true,
		);
	}, [
		featureProjectId,
		lastStatus,
		setAnalysisWorking,
		triggerOnboardingAnalysis,
		analysisAttemptedFor,
		setAnalysis,
		setCreditStatus,
		setAnalysisError,
	]);
	const refreshLegacySuggestions = useCallback(() => {
		if (!featureProjectId || !lastStatus?.snapshotId || !analysis?.id) return;
		setAnalysisError(null);
		void triggerOnboardingAnalysis(
			featureProjectId,
			lastStatus.snapshotId,
			analysis.id,
		);
	}, [
		featureProjectId,
		lastStatus,
		analysis,
		triggerOnboardingAnalysis,
		setAnalysisError,
	]);

	// Onboarding analysis trigger: once the server persisted a snapshot for
	// the current attempt, ensure the onboarding feature project and run the
	// real analysis through the existing boundary. Single-flight per snapshot;
	// the trigger is idempotent server-side, so refresh and remount are safe.
	// Never auto-navigates: reaching "summary" stays an explicit user action
	// on the in-card review CTA.
	useEffect(() => {
		const snapshotId = lastStatus?.snapshotId;
		if (!codebase || !lastStatus || !snapshotId) return;
		if (!SNAPSHOT_CONTEXT_STATUSES.includes(lastStatus.status)) return;
		if (reviewReady) return;
		if (
			lastStatus.analysisStatus === "pending" ||
			// The newest stored attempt is the real pending signal; `analysisStatus`
			// only ever carries ready content from the status route.
			lastStatus.analysisAttemptStatus === "pending" ||
			analysisAttemptedFor.current === snapshotId
		) {
			return;
		}
		analysisAttemptedFor.current = snapshotId;
		void (async () => {
			const projectId =
				featureProjectId ??
				(await ensureFeatureProject(codebase.id, codebase.name));
			if (!projectId) return;
			await triggerOnboardingAnalysis(projectId, snapshotId);
		})();
	}, [
		codebase,
		lastStatus,
		featureProjectId,
		reviewReady,
		ensureFeatureProject,
		triggerOnboardingAnalysis,
		analysisAttemptedFor,
	]);

	// Pull validated analysis output once status reports it. The status
	// endpoint only attaches analysisStatus when the analysis project query
	// is present (wired via the SyncStatus analysisProjectId passed by the
	// onboarding session hook), so this effect only ever renders
	// server-persisted output, never a fabrication.
	useEffect(() => {
		const snapshotId = lastStatus?.snapshotId;
		if (!featureProjectId || !snapshotId) return;
		if (
			lastStatus.analysisStatus !== "ready" &&
			lastStatus.analysisStatus !== "failed"
		)
			return;
		if (
			analysis?.snapshotId === snapshotId &&
			analysis.status === lastStatus.analysisStatus
		)
			return;
		void fetchAnalysisOutput(featureProjectId, snapshotId);
	}, [featureProjectId, lastStatus, analysis, fetchAnalysisOutput]);

	return { retryAnalysis, refreshLegacySuggestions };
}

/**
 * Whether the conclusion step may open for the current attempt.
 *
 * The review conclusion requires validated analysis output for the exact
 * snapshot the server currently reports; a snapshot alone never counts as a
 * review. This mirrors the workspace canRenderCodebaseReview predicate.
 */
export function useOnboardingSummaryGate({
	state,
	codebase,
	lastStatus,
}: {
	state: OnboardingAnalysisState;
	codebase: { id: string; name: string } | null;
	lastStatus: SyncStatusResponse | null;
}) {
	const canContinueToSummary = canContinueToCodebaseConclusion({
		status: lastStatus,
		analysis: state.analysis,
		codebaseId: codebase?.id ?? "",
		analysisProjectId: state.featureProjectId,
	});
	return { canContinueToSummary };
}
