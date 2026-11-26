import { useCallback, useEffect, useRef } from "react";
import {
	canContinueToCodebaseConclusion,
	ONBOARDING_FEATURE_MESSAGE,
} from "@/features/codebase/services/analysis";
import {
	readPlanCodebaseProjectPointer,
	storePlanCodebaseProjectPointer,
} from "@/features/codebase/services/plan-storage";
import {
	CODEBASE_SYNC_COMPLETE_STATUSES,
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
	// The analysis identity this client already asked the read endpoint for, so
	// one persisted row is read once per attempt instead of once per frame.
	const analysisReconciledFor = useRef<string | null>(null);
	// The working flag lives in shared state, but the retry guard runs inside
	// a callback: a ref mirror keeps the guard synchronous so a double click
	// in the same tick still resolves to one attempt.
	const analysisWorkingRef = useRef(state.analysisWorking);
	analysisWorkingRef.current = state.analysisWorking;
	const identity = `${codebase?.id}:${lastStatus?.sessionId}:${lastStatus?.snapshotId}`;
	const identityRef = useRef(identity);
	if (identityRef.current !== identity) {
		identityRef.current = identity;
		analysisRequestGeneration.current += 1;
		analysisWorkingRef.current = false;
		analysisReconciledFor.current = null;
	}
	useEffect(
		() => () => {
			analysisRequestGeneration.current += 1;
		},
		[],
	);

	// Ensure the single onboarding analysis project for this codebase via the
	// existing features boundary. The stored pointer is reused so refresh and
	// remount never mint duplicate projects; the server still owns validation
	// (CODEBASE_NOT_SYNCED races surface as an honest error below).
	const ensureFeatureProject = useCallback(
		async (
			codebaseId: string,
			_fallbackName?: string,
		): Promise<string | null> => {
			const stored = readPlanCodebaseProjectPointer();
			const owner = identityRef.current;
			if (stored) {
				setFeatureProjectId(stored);
				return stored;
			}
			// A provisional creation name is storage-only: it must never be sent
			// as the feature message, or the analysis would read the placeholder
			// as user intent. The neutral onboarding intent asks for an initial
			// repository summary instead.
			const message = ONBOARDING_FEATURE_MESSAGE;
			try {
				const outcome = await requestFeatureProject(codebaseId, message);
				if (owner !== identityRef.current) return null;
				if (outcome.kind === "unauthorized") return null;
				if (outcome.kind === "rejected") {
					setAnalysisError(outcome.message);
					return null;
				}
				storePlanCodebaseProjectPointer(outcome.projectId);
				setFeatureProjectId(outcome.projectId);
				return outcome.projectId;
			} catch {
				if (owner !== identityRef.current) return null;
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
		): Promise<void> => {
			const generation = ++analysisRequestGeneration.current;
			analysisWorkingRef.current = true;
			setAnalysisWorking(true);
			setAnalysisError(null);
			setCreditStatus(null);
			try {
				const outcome = await requestOnboardingAnalysis({
					projectId,
					snapshotId,
					refreshStarterSuggestionsForAnalysisId,
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
				if (outcome.kind === "pending") return;
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
				// Delivery failure does not prove the server attempt failed, so no
				// error is painted. Releasing the per-snapshot guard lets the next
				// successful status read ask again; the server reuses a pending row
				// instead of stacking a second attempt.
				if (generation === analysisRequestGeneration.current) {
					analysisAttemptedFor.current = null;
				}
			} finally {
				if (generation === analysisRequestGeneration.current) {
					setAnalysisWorking(false);
					analysisWorkingRef.current = false;
				}
			}
		},
		[
			setAnalysis,
			setAnalysisError,
			setAnalysisWorking,
			setCreditStatus,
			analysisAttemptedFor,
		],
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
		analysisWorkingRef.current = true;
		analysisAttemptedFor.current = lastStatus.snapshotId;
		setCreditStatus(null);
		setAnalysis(null);
		setAnalysisWorking(true, { retrying: true });
		setAnalysisError(null);
		void triggerOnboardingAnalysis(featureProjectId, lastStatus.snapshotId);
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
		if (!CODEBASE_SYNC_COMPLETE_STATUSES.includes(lastStatus.status)) return;
		if (
			lastStatus.analysisAttemptStatus === "failed" ||
			lastStatus.analysisStatus === "failed"
		)
			return;
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
		const owner = identityRef.current;
		void (async () => {
			const projectId =
				featureProjectId ??
				(await ensureFeatureProject(codebase.id, codebase.name));
			if (!projectId) return;
			if (owner !== identityRef.current) return;
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

	// Reconcile the exact analysis the server names as ready.
	//
	// Status is the only authority for that identity, so the read is driven by
	// it: fetch until the client holds THAT row (id, snapshot, and project), and
	// never let local facts veto server truth. Two local facts used to: a
	// trigger request still in flight, and a newer pending attempt. Either one
	// could keep the browser from ever reading a persisted ready output while
	// the screen already painted the analysis as finished — the exact
	// "conclusion stays disabled until refresh" defect. The read endpoint serves
	// the newest readable analysis for this snapshot by design, so it is safe to
	// ask while another attempt is pending.
	const serverReadyAnalysisId =
		lastStatus?.analysisStatus === "ready"
			? (lastStatus.analysisId ?? null)
			: null;
	useEffect(() => {
		const snapshotId = lastStatus?.snapshotId;
		if (!featureProjectId || !snapshotId || !serverReadyAnalysisId) return;
		if (
			analysis?.id === serverReadyAnalysisId &&
			analysis.snapshotId === snapshotId &&
			analysis.projectId === featureProjectId
		)
			return;
		// One read per (project, snapshot, analysis) identity: a miss stays open
		// for the next real frame instead of looping, and a newer identity always
		// re-reads.
		const key = `${featureProjectId}:${snapshotId}:${serverReadyAnalysisId}`;
		if (analysisReconciledFor.current === key) return;
		analysisReconciledFor.current = key;
		void fetchAnalysisOutput(featureProjectId, snapshotId).then((result) => {
			if (!result && analysisReconciledFor.current === key)
				analysisReconciledFor.current = null;
		});
	}, [
		featureProjectId,
		lastStatus,
		analysis,
		fetchAnalysisOutput,
		serverReadyAnalysisId,
	]);

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
