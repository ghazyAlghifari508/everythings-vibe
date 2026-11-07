import { useCallback, useEffect, useRef, useState } from "react";
import { useCodebaseSyncStatus } from "@/features/codebase/hooks/use-codebase-sync-status";
import { useCodebaseSyncStream } from "@/features/codebase/hooks/use-codebase-sync-stream";
import type { PlanCodebaseIntent } from "@/features/codebase/services/onboarding-intent";
import {
	clearPlanCodebaseProjectPointer,
	clearPlanOnboardingPointers,
	type PlanCodebaseStep,
	readPlanCodebasePointer,
	storePlanCodebasePointer,
	storePlanCodebaseStepPointer,
} from "@/features/codebase/services/plan-storage";
import type {
	SyncPromptPayload,
	SyncStatusResponse,
} from "@/features/codebase/services/sync";
import type { AnalysisCreditStatus } from "../services/analysis-credit-policy";
import { requestAnalysisCreditPreflight } from "../services/analysis-credit-requests";
import { readOnboardingRequestId } from "../services/onboarding-request-identity";
import {
	type CreatedCodebase,
	requestCreateCodebase,
	requestRetrySession,
} from "../services/onboarding-requests";
import type { OnboardingAnalysisState } from "./use-onboarding-analysis-state";
import { useOnboardingRecovery } from "./use-onboarding-recovery";

/**
 * The create / recover / retry session machine for `/plan/codebase`.
 *
 * It owns the single canonical reconciliation loop for the whole onboarding
 * flow (see `useCodebaseSyncStatus`): the prompt screen needs the CLI
 * handshake, the sync screen needs the transport stages, and the conclusion
 * screen needs the persisted analysis status — all three read this one
 * snapshot, so no two screens can disagree and no second poller races it.
 *
 * The analysis state is passed in because replacing a session also discards
 * the analysis it belonged to; refresh recovery lives in
 * `useOnboardingRecovery` and the status-driven analysis effects live in
 * `useOnboardingAnalysis`.
 */
export function useCodebaseOnboarding({
	analysisState,
	step,
	setStep,
	intent,
}: {
	analysisState: OnboardingAnalysisState;
	step: PlanCodebaseStep;
	setStep: (step: PlanCodebaseStep) => void;
	/**
	 * Navigation intent from the route search param. `"new"` is an explicit
	 * fresh start and never inherits a previous attempt's visible state;
	 * `"resume"` and an absent intent both recover from the stored pointer.
	 */
	intent?: PlanCodebaseIntent;
}) {
	const {
		setFeatureProjectId,
		setAnalysis,
		setAnalysisError,
		analysisAttemptedFor,
	} = analysisState;
	const [error, setError] = useState<string | null>(null);
	const [creditStatus, setCreditStatus] = useState<AnalysisCreditStatus | null>(
		null,
	);
	const [isStarting, setIsStarting] = useState(false);
	const [codebase, setCodebase] = useState<CreatedCodebase | null>(null);
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const queryInFlight = useRef(false);
	// Recovered status is the poller's seed, so the first paint after a refresh
	// already reflects persisted server state instead of an empty loading card.
	const [recoveredStatus, setRecoveredStatus] =
		useState<SyncStatusResponse | null>(null);
	const autoInitAttempted = useRef(false);
	// Entering `/plan/codebase` from an explicit "Hubungkan repository" action IS
	// the start intent, so the flow prepares its own session instead of parking
	// an intermediate button in front of the prompt. The ref keeps a rerender
	// from minting a second session for the same intent.
	const autoStartAttempted = useRef(false);
	// and two sync sessions for one onboarding attempt. State updates are async,
	// so a ref is what actually closes the window.
	const createInFlight = useRef(false);
	// Atomic session identity: the poller, prompt, expiry, error, and progress
	// list all follow this one id. A new session is a reset, not a migration.
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

	// One canonical reconciliation loop for the whole onboarding flow. The
	// prompt screen needs the CLI handshake, the sync screen needs the
	// transport stages, and the conclusion screen needs the persisted
	// analysis status — all three read this single snapshot, so no two
	// screens can disagree and no second poller races this one.
	//
	// Delivery has two channels that share one projection: the live stream pushes
	// a real transition as it is persisted, and status polling takes over whenever
	// the stream cannot be used. Only one of them is ever asked at a time, and
	// both return the same server snapshot, so the choice can never change what is
	// rendered — only how fast it arrives.
	const stream = useCodebaseSyncStream({
		codebaseId: codebase?.id ?? null,
		sessionId: activeSessionId,
		analysisProjectId: analysisState.featureProjectId,
		enabled: codebase !== null,
	});
	// Polling only stands down once a real frame has landed, so a stream that opens
	// but never delivers cannot leave the screen without a source.
	const streamDelivers = stream.connection === "live" && stream.status !== null;
	const { status: polledStatus, error: statusPollError } =
		useCodebaseSyncStatus({
			codebaseId: codebase?.id ?? null,
			analysisProjectId: analysisState.featureProjectId,
			sessionId: activeSessionId,
			initialStatus: recoveredStatus,
			enabled: codebase !== null && !streamDelivers,
		});
	const lastStatus = (streamDelivers ? stream.status : null) ?? polledStatus;
	// A dropped update channel is reported as a channel problem only. It must
	// never read as a failed sync, because the persisted attempt is untouched.
	const streamNotice =
		stream.connection === "reconnecting"
			? "Koneksi pembaruan terputus. Menghubungkan kembali..."
			: null;

	useEffect(() => {
		setStep("sync");
	}, [setStep]);

	// Persist the step, never the domain state: a refresh returns the user to
	// the screen they were reading, and recovery re-validates it against the
	// server snapshot instead of trusting it.
	useEffect(() => {
		if (!codebase) return;
		storePlanCodebaseStepPointer(step);
	}, [codebase, step]);

	const adoptPayload = useCallback(
		(next: SyncPromptPayload | null, seed: SyncStatusResponse | null) => {
			// One atomic reset: every surface (prompt, expiry, poller, error,
			// progress, analysis) follows the new session identity together.
			setPayload(next);
			setActiveSessionId(next?.sessionId ?? null);
			setRecoveredStatus(seed);
			setAnalysis(null);
			setAnalysisError(null);
			analysisAttemptedFor.current = null;
			setError(null);
		},
		[setAnalysis, setAnalysisError, analysisAttemptedFor],
	);

	// Explicit fresh start: drop the browser pointers to any previous attempt and
	// every piece of visible state derived from it, so nothing from the old
	// repository can paint onto the new session. The backend keeps the old
	// session and snapshot untouched for History — only the browser's pointer to
	// it is forgotten.
	const resetForFreshStart = useCallback(() => {
		clearPlanOnboardingPointers();
		setRecoveredStatus(null);
		setActiveSessionId(null);
		setFeatureProjectId(null);
		setAnalysis(null);
		setAnalysisError(null);
		analysisAttemptedFor.current = null;
		setError(null);
	}, [
		setAnalysis,
		setAnalysisError,
		setFeatureProjectId,
		analysisAttemptedFor,
	]);

	const refreshCreditStatus = useCallback(async () => {
		if (queryInFlight.current) return;
		queryInFlight.current = true;
		try {
			setError(null);
			setCreditStatus(await requestAnalysisCreditPreflight());
		} catch (error: unknown) {
			setError(
				error instanceof Error
					? error.message
					: "Kebutuhan kredit belum dapat diperiksa.",
			);
		} finally {
			queryInFlight.current = false;
		}
	}, []);

	const createCodebase = useCallback(async () => {
		if (createInFlight.current) return;
		if (!creditStatus) {
			await refreshCreditStatus();
			return;
		}
		if (!creditStatus.canStart) return;
		createInFlight.current = true;
		setError(null);
		setIsStarting(true);
		const requestId = readOnboardingRequestId();
		try {
			const outcome = await requestCreateCodebase();
			if (readOnboardingRequestId() !== requestId) return;
			if (outcome.kind === "unauthorized") return;
			if (outcome.kind === "rejected") {
				await refreshCreditStatus();
				setError(outcome.message);
				return;
			}
			setCodebase(outcome.codebase);
			storePlanCodebasePointer(outcome.codebase.id, outcome.codebase.name);
			window.history.replaceState(
				{ ...window.history.state, codebaseStartCodebase: outcome.codebase.id },
				"",
			);
			clearPlanCodebaseProjectPointer();
			setFeatureProjectId(null);
			// A brand new session has no server history: adopt its identity so
			// the poller cannot paint the previous attempt's state onto this one.
			adoptPayload(outcome.payload, null);
			setStep("sync");
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			createInFlight.current = false;
			setIsStarting(false);
		}
	}, [
		creditStatus,
		refreshCreditStatus,
		setStep,
		setFeatureProjectId,
		adoptPayload,
	]);

	const recoverCodebase = useOnboardingRecovery({
		analysisState,
		setError,
		setIsStarting,
		setCodebase,
		setRecoveredStatus,
		setActiveSessionId,
		setStep,
		setPayload,
		setCreditStatus,
	});

	useEffect(() => {
		if (autoInitAttempted.current) return;
		autoInitAttempted.current = true;
		// An explicit "Hubungkan repository" visit is a fresh start: there is
		// nothing to recover, and inheriting the previous attempt is exactly the
		// mixed old/new state this flow must never render. The eligibility check
		// then prepares a brand new session (see the auto-start effect below).
		readOnboardingRequestId();
		const currentPointer = readPlanCodebasePointer();
		if (
			intent === "new" &&
			window.history.state?.codebaseStartCodebase !== currentPointer?.id
		) {
			resetForFreshStart();
			void refreshCreditStatus();
			return;
		}
		// Recovery reads persisted work; a fresh start resolves eligibility first
		// and then prepares its own session (see the auto-start effect below).
		if (!readPlanCodebasePointer()) {
			void refreshCreditStatus();
			return;
		}
		void (async () => {
			if (!(await recoverCodebase())) await refreshCreditStatus();
		})();
	}, [intent, recoverCodebase, refreshCreditStatus, resetForFreshStart]);

	useEffect(() => {
		if (codebase || isStarting || autoStartAttempted.current) return;
		if (!creditStatus?.canStart) return;
		autoStartAttempted.current = true;
		void createCodebase();
	}, [codebase, createCodebase, creditStatus, isStarting]);

	const retrySession = useCallback(async () => {
		if (!codebase || createInFlight.current) return;
		createInFlight.current = true;
		// A retry continues an existing repository context, not a fresh start.
		setError(null);
		setIsStarting(true);
		try {
			const outcome = await requestRetrySession(codebase.id);
			if (outcome.kind === "cancelled") return;
			if (outcome.kind === "failed") {
				setError("Sesi sync gagal dibuat. Coba lagi.");
				return;
			}
			adoptPayload(outcome.payload, null);
			setStep("sync");
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "Server tidak dapat dihubungi.",
			);
		} finally {
			createInFlight.current = false;
			setIsStarting(false);
		}
	}, [codebase, adoptPayload, setStep]);

	// The server owns the name: once the CLI has handshaken it holds the
	// repository folder name, so the open onboarding page must not keep showing
	// the creation placeholder it started with.
	useEffect(() => {
		const serverName = lastStatus?.codebaseName;
		if (!serverName) return;
		setCodebase((current) =>
			current && current.name !== serverName
				? { ...current, name: serverName }
				: current,
		);
	}, [lastStatus]);

	// Persist the pointer whenever the name changes so a refresh does not
	// repaint the placeholder before the first status poll lands.
	useEffect(() => {
		if (!codebase) return;
		storePlanCodebasePointer(codebase.id, codebase.name);
	}, [codebase]);

	return {
		error,
		isStarting,
		codebase,
		payload,
		lastStatus,
		statusPollError,
		streamNotice,
		createCodebase,
		creditStatus,
		retrySession,
		refreshCreditStatus,
	};
}
