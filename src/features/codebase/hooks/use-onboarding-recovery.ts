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
/**
 * Session states that prove the transport persisted a snapshot.
 *
 * `analyzing` is what the session reports right after a verified upload while
 * the model works; the snapshot underneath is already `uploaded`. Recovery that
 * ignored it would drop the analysis context and leave the progress screen
 * unable to show (or retry) the attempt the user came back for. The snapshot
 * row's own status stays governed by `SNAPSHOT_CONTEXT_STATUSES`.
 */
const RECOVERED_SNAPSHOT_SESSION_STATUSES: readonly string[] = [
	...SNAPSHOT_CONTEXT_STATUSES,
	"analyzing",
];

function hasRecoveredSnapshot(recovered: SyncStatusResponse): boolean {
	return (
		Boolean(recovered.snapshotId) &&
		RECOVERED_SNAPSHOT_SESSION_STATUSES.includes(recovered.status)
	);
}

function resolveRecoveredStep(
	recovered: SyncStatusResponse,
	storedStep: PlanCodebaseStep | null,
	isAnalysisReady?: boolean,
): PlanCodebaseStep {
	const hasSnapshot = hasRecoveredSnapshot(recovered);
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
	adoptSession,
	setError,
	setIsStarting,
	setCodebase,
	setRecoveredStatus,
	setActiveSessionId,
	setStep,
}: {
	analysisState: OnboardingAnalysisState;
	adoptSession: (
		payload: SyncPromptPayload | null,
		seed: SyncStatusResponse | null,
	) => void;
	setError: (error: string | null) => void;
	setIsStarting: (starting: boolean) => void;
	setCodebase: (codebase: { id: string; name: string }) => void;
	setRecoveredStatus: (status: SyncStatusResponse | null) => void;
	setActiveSessionId: (sessionId: string | null) => void;
	setStep: (step: PlanCodebaseStep) => void;
}) {
	const { analysisAttemptedFor, setFeatureProjectId, fetchAnalysisOutput } =
		analysisState;

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
			// Pin the poller to the recovered attempt: without this, the first
			// poll asks for the latest session unscoped and can report a
			// sibling attempt's state before settling on this one.
			const recoveredSnapshotId = recovered.snapshotId;
			if (hasRecoveredSnapshot(recovered) && recoveredSnapshotId) {
				setRecoveredStatus(recovered);
				setActiveSessionId(recovered.sessionId);
				const storedStep = readPlanCodebaseStepPointer();
				// A usable snapshot is the precondition for the conclusion step, so the
				// onboarding analysis context is restored only here. Which of the two
				// steps the user lands on is then decided by `resolveRecoveredStep`,
				// which keeps the stored intent from overriding this evidence.
				const storedProject = readPlanCodebaseProjectPointer();
				let existingAnalysis: AnalysisResponse | null = null;
				if (storedProject) {
					setFeatureProjectId(storedProject);
					existingAnalysis = await fetchAnalysisOutput(
						storedProject,
						recoveredSnapshotId,
					);
					if (
						(existingAnalysis?.output &&
							existingAnalysis.snapshotId === recoveredSnapshotId &&
							existingAnalysis.status === "ready") ||
						recovered.analysisStatus === "pending" ||
						recovered.analysisAttemptStatus === "pending" ||
						existingAnalysis?.status === "pending"
					) {
						analysisAttemptedFor.current = recoveredSnapshotId;
					}
				}
				const isAnalysisReady = canContinueToCodebaseConclusion({
					status: recovered,
					analysis: existingAnalysis,
					codebaseId: stored.id,
					analysisProjectId: storedProject,
				});
				setActiveSessionId(recovered.sessionId);
				setRecoveredStatus(null);
				setCodebase({ id: stored.id, name: recoveredName });
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
					adoptSession(retryOutcome.payload, null);
					setStep("sync");
					return true;
				}
				clearPlanOnboardingPointers();
				return false;
			}
			// The CLI is mid-attempt. Return the user to the screen they left, and
			// let the prompt screen report the handshake rather than assuming the
			// transport is what they came back to check.
			const storedStep = readPlanCodebaseStepPointer();
			setRecoveredStatus(recovered);
			setActiveSessionId(recovered.sessionId);
			setStep(resolveRecoveredStep(recovered, storedStep));
			return true;
		} catch {
			clearPlanOnboardingPointers();
			return false;
		} finally {
			setIsStarting(false);
		}
	}, [
		adoptSession,
		setActiveSessionId,
		setStep,
		setError,
		setIsStarting,
		setCodebase,
		setRecoveredStatus,
		setFeatureProjectId,
		analysisAttemptedFor,
		fetchAnalysisOutput,
	]);
}
