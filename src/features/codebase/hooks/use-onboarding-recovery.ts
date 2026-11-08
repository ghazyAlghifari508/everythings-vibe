import { useCallback, useEffect, useRef } from "react";
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
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import type { AnalysisCreditStatus } from "../services/analysis-credit-policy";
import { requestAnalysisCreditPreflight } from "../services/analysis-credit-requests";
import { requestCodebaseStatus } from "../services/onboarding-requests";
import type { PromptRecovery } from "../services/prompt-recovery";
import type { SyncPromptPayload } from "../services/sync";
import {
	forgetSyncPrompt,
	readSyncPrompt,
} from "../services/sync-prompt-vault";
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
 * status; the raw credential never comes from storage — only from the
 * app-lifetime memory vault, which survives route navigation inside the running
 * app but not a reload. A missing credential is a RECOVERABLE state (explicit
 * "Buat prompt baru"), never a generic failure: nothing broke, the one-time
 * token simply is not in this browser's memory. Recovery itself never mints or
 * revokes anything — replacement is the user's explicit action.
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
	setActiveSessionId,
	setStep,
	setPayload,
	setCreditStatus,
	setPromptRecovery,
}: {
	analysisState: OnboardingAnalysisState;
	setError: (error: string | null) => void;
	setIsStarting: (starting: boolean) => void;
	setCodebase: (codebase: { id: string; name: string }) => void;
	setRecoveredStatus: (status: SyncStatusResponse | null) => void;
	setActiveSessionId: (sessionId: string | null) => void;
	setStep: (step: PlanCodebaseStep) => void;
	setPayload: (payload: SyncPromptPayload | null) => void;
	setCreditStatus: (status: AnalysisCreditStatus | null) => void;
	/** Recoverable prompt states; never routed through `setError`. */
	setPromptRecovery: (recovery: PromptRecovery | null) => void;
}) {
	const {
		analysisAttemptedFor,
		setAnalysis,
		setAnalysisError,
		setFeatureProjectId,
		fetchAnalysisOutput,
	} = analysisState;
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	return useCallback(async (): Promise<boolean> => {
		const stored = readPlanCodebasePointer();
		const isCurrent = () =>
			mounted.current && readPlanCodebasePointer()?.id === stored?.id;
		if (!stored) return false;
		setError(null);
		setPromptRecovery(null);
		setIsStarting(true);
		try {
			const statusOutcome = await requestCodebaseStatus(stored.id);
			if (!isCurrent()) return true;
			if (statusOutcome.kind === "unauthorized") return true;
			if (statusOutcome.kind === "stale") {
				// Stale pointer: clear all onboarding state so a subsequent fresh
				// start cannot inherit the previous attempt's analysis or error.
				setIsStarting(false);
				clearPlanOnboardingPointers();
				forgetSyncPrompt(stored.id);
				setRecoveredStatus(null);
				setActiveSessionId(null);
				setAnalysis(null);
				setAnalysisError(null);
				analysisAttemptedFor.current = null;
				return false;
			}
			const recovered = statusOutcome.status;
			const recoveredName = recovered.codebaseName ?? stored.name;
			if (!recoveredName) {
				setIsStarting(false);
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
				const storedProject =
					recovered.analysisProjectId ?? readPlanCodebaseProjectPointer();
				let existingAnalysis: AnalysisResponse | null = null;
				if (storedProject) {
					setFeatureProjectId(storedProject);
					existingAnalysis = await fetchAnalysisOutput(
						storedProject,
						recoveredSnapshotId,
					);
					if (!isCurrent()) return true;
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
				setRecoveredStatus(recovered);
				setCodebase({ id: stored.id, name: recoveredName });
				setStep(resolveRecoveredStep(recovered, storedStep, isAnalysisReady));
				return true;
			}
			if (recovered.status === "waiting_for_cli") {
				setRecoveredStatus(recovered);
				setActiveSessionId(recovered.sessionId);
				// Same running app: the one-time prompt is still in memory, so the
				// user gets the SAME credential back. Never mint, never rotate.
				// A reload has no memory, so this is a miss and falls through to the
				// recoverable state below — never to a fabricated prompt.
				const held = readSyncPrompt(stored.id, recovered.sessionId);
				if (held) {
					setPayload(held);
					setPromptRecovery(null);
					setStep("sync");
					return true;
				}
				// A failed eligibility read must not hide the recoverable prompt: the
				// server re-checks credit before minting, so the honest UI here is the
				// explicit recovery action, not a status error.
				const credit = await requestAnalysisCreditPreflight().catch(() => null);
				if (!isCurrent()) return true;
				setCreditStatus(credit);
				setPromptRecovery({
					code: "PROMPT_UNAVAILABLE",
					sessionId: recovered.sessionId,
				});
				setStep("sync");
				return true;
			}
			if (recovered.status === "expired") {
				// An expired credential can never be reused; the user creates a new
				// prompt for THIS repository. Recovery does not rotate on its own.
				setRecoveredStatus(recovered);
				setActiveSessionId(recovered.sessionId);
				const credit = await requestAnalysisCreditPreflight().catch(() => null);
				if (!isCurrent()) return true;
				setCreditStatus(credit);
				setPromptRecovery({
					code: "PROMPT_EXPIRED",
					sessionId: recovered.sessionId,
				});
				setStep(resolveRecoveredStep(recovered, readPlanCodebaseStepPointer()));
				return true;
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
			if (!isCurrent()) return true;
			setError("Status repository belum dapat dibaca. Coba lagi.");
			return true;
		} finally {
			if (isCurrent()) setIsStarting(false);
		}
	}, [
		setActiveSessionId,
		setPayload,
		setCreditStatus,
		setStep,
		setError,
		setIsStarting,
		setCodebase,
		setRecoveredStatus,
		setPromptRecovery,
		setFeatureProjectId,
		analysisAttemptedFor,
		setAnalysis,
		setAnalysisError,
		fetchAnalysisOutput,
	]);
}
