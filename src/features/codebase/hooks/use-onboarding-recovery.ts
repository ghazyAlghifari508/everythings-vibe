import { useCallback } from "react";
import {
	type AnalysisResponse,
	canContinueToCodebaseConclusion,
} from "@/features/codebase/services/analysis";
import {
	clearPlanOnboardingPointers,
	type PlanCodebaseStep,
	readPlanCodebasePointer,
	readPlanCodebaseProjectPointer,
	readPlanCodebaseStepPointer,
} from "@/features/codebase/services/plan-storage";
import {
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import {
	requestCodebaseStatus,
	requestRetrySession,
} from "../services/onboarding-requests";
import type { OnboardingAnalysisState } from "./use-onboarding-analysis-state";

/**
 * Restore the step the user was on, validated against real server evidence.
 *
 * A stored intent is a preference, not a fact, and it is only ever consulted
 * AFTER the server has confirmed the precondition for the step it names: the
 * conclusion step needs a usable current snapshot, and without one there is
 * nothing to analyse, so a refresh always lands back on the sync step rather
 * than faking a summary. When the snapshot does exist, the stored intent still
 * matters — a user who refreshed while the upload was landing should come back
 * to the completed sync state they were watching, not to a conclusion step they
 * never reached.
 */
function resolveRecoveredStep(
	recovered: SyncStatusResponse,
	storedStep: PlanCodebaseStep | null,
	isAnalysisReady?: boolean,
): PlanCodebaseStep {
	const hasSnapshot =
		Boolean(recovered.snapshotId) &&
		SNAPSHOT_CONTEXT_STATUSES.includes(recovered.status);
	if (!hasSnapshot) return "sync";
	return storedStep === "summary" && Boolean(isAnalysisReady)
		? "summary"
		: "sync";
}

/**
 * Refresh recovery for `/plan/codebase`.
 *
 * The stored id is only a pointer. Authoritative sync state comes from GET
 * status. A missing token after refresh is never restored from storage; waiting
 * sessions mint a fresh credential via retry, while in-flight/uploaded sessions
 * resume polling without disturbing the active attempt.
 *
 * Kept apart from the create/retry session machine because it is the one branch
 * that has to read persisted analysis output before it can decide which step to
 * restore, and because nothing else needs to know how recovery resolves.
 */
export function useOnboardingRecovery({
	analysisState,
	setError,
	setIsStarting,
	setCodebase,
	setRecoveredStatus,
	setPayload,
	setStep,
}: {
	analysisState: OnboardingAnalysisState;
	setError: (error: string | null) => void;
	setIsStarting: (starting: boolean) => void;
	setCodebase: (codebase: { id: string; name: string }) => void;
	setRecoveredStatus: (status: SyncStatusResponse | null) => void;
	setPayload: (payload: SyncPromptPayload | null) => void;
	setStep: (step: PlanCodebaseStep) => void;
}) {
	const {
		setFeatureProjectId,
		setAnalysis,
		setAnalysisError,
		analysisAttemptedFor,
		fetchAnalysisOutput,
	} = analysisState;

	return useCallback(async (): Promise<boolean> => {
		const stored = readPlanCodebasePointer();
		if (!stored) return false;
		setError(null);
		setIsStarting(true);
		try {
			const statusOutcome = await requestCodebaseStatus(stored.id);
			if (statusOutcome.kind === "unauthorized") return true;
			if (statusOutcome.kind === "stale") {
				clearPlanOnboardingPointers();
				return false;
			}
			const recovered = statusOutcome.status;
			const recoveredName = recovered.codebaseName ?? stored.name;
			if (!recoveredName) {
				clearPlanOnboardingPointers();
				return false;
			}
			setCodebase({ id: stored.id, name: recoveredName });
			setRecoveredStatus(recovered);
			const storedStep = readPlanCodebaseStepPointer();
			// A usable snapshot is the precondition for the conclusion step, so the
			// onboarding analysis context is restored only here. Which of the two
			// steps the user lands on is then decided by `resolveRecoveredStep`,
			// which keeps the stored intent from overriding this evidence.
			if (
				recovered.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(recovered.status)
			) {
				const storedProject = readPlanCodebaseProjectPointer();
				let existingAnalysis: AnalysisResponse | null = null;
				if (storedProject) {
					setFeatureProjectId(storedProject);
					existingAnalysis = await fetchAnalysisOutput(
						storedProject,
						recovered.snapshotId,
					);
					if (
						(existingAnalysis?.output &&
							existingAnalysis.snapshotId === recovered.snapshotId &&
							existingAnalysis.status === "ready") ||
						recovered.analysisStatus === "pending" ||
						existingAnalysis?.status === "pending"
					) {
						analysisAttemptedFor.current = recovered.snapshotId;
					}
				}
				const isAnalysisReady = canContinueToCodebaseConclusion({
					status: recovered,
					analysis: existingAnalysis,
					codebaseId: stored.id,
					analysisProjectId: storedProject,
				});
				setPayload(null);
				setStep(resolveRecoveredStep(recovered, storedStep, isAnalysisReady));
				return true;
			}
			if (
				recovered.status === "waiting_for_cli" ||
				recovered.status === "failed" ||
				recovered.status === "expired"
			) {
				const retryOutcome = await requestRetrySession(stored.id);
				if (retryOutcome.kind === "cancelled") {
					setStep("sync");
					return true;
				}
				if (retryOutcome.kind === "minted") {
					setPayload(retryOutcome.payload);
					// The fresh session starts from scratch: drop the previous
					// attempt's state so the poller cannot resurrect it.
					setRecoveredStatus(null);
					setAnalysis(null);
					setAnalysisError(null);
					analysisAttemptedFor.current = null;
					setStep("sync");
					return true;
				}
				clearPlanOnboardingPointers();
				return false;
			}
			// The CLI is mid-attempt. Return the user to the screen they left, and
			// let the prompt screen report the handshake rather than assuming the
			// transport is what they came back to check.
			setStep(resolveRecoveredStep(recovered, storedStep));
			return true;
		} catch {
			clearPlanOnboardingPointers();
			return false;
		} finally {
			setIsStarting(false);
		}
	}, [
		setStep,
		setError,
		setIsStarting,
		setCodebase,
		setRecoveredStatus,
		setPayload,
		setFeatureProjectId,
		setAnalysis,
		setAnalysisError,
		analysisAttemptedFor,
		fetchAnalysisOutput,
	]);
}
