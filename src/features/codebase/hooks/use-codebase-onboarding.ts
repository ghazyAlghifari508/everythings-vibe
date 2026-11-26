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
import {
	type PromptRecovery,
	promptRecoveryFromSessionCode,
} from "../services/prompt-recovery";
import {
	clearSyncPromptVault,
	rememberSyncPrompt,
} from "../services/sync-prompt-vault";
import type { OnboardingAnalysisState } from "./use-onboarding-analysis-state";
import { useOnboardingRecovery } from "./use-onboarding-recovery";

/** Owns create/recovery and one reconciled server snapshot for every screen. */
export function useCodebaseOnboarding({
	analysisState,
	step,
	setStep,
	intent,
}: {
	analysisState: OnboardingAnalysisState;
	step: PlanCodebaseStep;
	setStep: (step: PlanCodebaseStep) => void;
	/** New navigation starts fresh; refresh retains the history entry identity. */
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
	// A recoverable prompt state: the repository/session exist, the one-time
	// credential is not available in this browser. Never stored in `error`,
	// because nothing failed and a generic retry is the wrong action.
	const [promptRecovery, setPromptRecovery] = useState<PromptRecovery | null>(
		null,
	);
	const queryInFlight = useRef(false);
	// Recovered status is the poller's seed, so the first paint after a refresh
	// already reflects persisted server state instead of an empty loading card.
	const [recoveredStatus, setRecoveredStatus] =
		useState<SyncStatusResponse | null>(null);
	const autoInitAttempted = useRef(false);
	// One automatic request per mounted attempt; retries retain its server key.
	const autoStartAttempted = useRef(false);
	// State updates are async: close the duplicate-click window synchronously.
	const createInFlight = useRef(false);
	// Atomic session identity: the poller, prompt, expiry, error, and progress
	// list all follow this one id. A new session is a reset, not a migration.
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	// Stream and polling project the same persisted session; no simulated states.
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
	const candidate =
		(streamDelivers ? stream.status : null) ?? polledStatus ?? recoveredStatus;
	const lastStatus =
		candidate !== null &&
		candidate.projectId === codebase?.id &&
		(!activeSessionId || candidate.sessionId === activeSessionId)
			? candidate
			: null;
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
			// The raw credential is retained in app memory only, so a route
			// navigation can hand back this exact prompt; a replacement overwrites
			// the previous entry for the codebase.
			if (next) rememberSyncPrompt(next);
			setPayload(next);
			setActiveSessionId(next?.sessionId ?? null);
			setPromptRecovery(null);
			setRecoveredStatus(seed);
			setAnalysis(null);
			setAnalysisError(null);
			analysisAttemptedFor.current = null;
			setError(null);
			setCreditStatus((current) =>
				current ? { ...current, canStart: true } : null,
			);
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
		clearSyncPromptVault();
		setCreditStatus(null);
		setRecoveredStatus(null);
		setActiveSessionId(null);
		setPromptRecovery(null);
		setFeatureProjectId(null);
		setAnalysis(null);
		setAnalysisError(null);
		analysisAttemptedFor.current = null;
		setError(null);
		setPayload(null);
		setCodebase(null);
		analysisState.setAnalysisWorking(false);
		analysisState.setCreditStatus(null);
	}, [
		setAnalysis,
		setAnalysisError,
		setFeatureProjectId,
		analysisAttemptedFor,
		analysisState.setAnalysisWorking,
		analysisState.setCreditStatus,
	]);

	// The recoverable prompt state is only valid while the attempt is genuinely
	// waiting (or expired). Once the server reports a real CLI connection, upload,
	// or snapshot, the obsolete recovery message must disappear rather than sit
	// next to live progress.
	useEffect(() => {
		if (!promptRecovery || !lastStatus) return;
		if (
			lastStatus.status !== "waiting_for_cli" &&
			lastStatus.status !== "expired"
		)
			setPromptRecovery(null);
	}, [lastStatus, promptRecovery]);

	const refreshCreditStatus = useCallback(async () => {
		if (queryInFlight.current) return;
		queryInFlight.current = true;
		const requestId = readOnboardingRequestId();
		try {
			setError(null);
			const status = await requestAnalysisCreditPreflight();
			if (mounted.current && readOnboardingRequestId() === requestId)
				setCreditStatus(status);
		} catch (error: unknown) {
			if (mounted.current && readOnboardingRequestId() === requestId)
				setError(
					error instanceof Error
						? error.message
						: "Kebutuhan kredit belum dapat diperiksa.",
				);
		} finally {
			queryInFlight.current = false;
		}
	}, []);

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
		setPromptRecovery,
	});
	const createCodebase = useCallback(async () => {
		if (createInFlight.current || codebase) return;
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
			const outcome = await requestCreateCodebase(requestId);
			if (!mounted.current || readOnboardingRequestId() !== requestId) return;
			if (outcome.kind === "unauthorized") {
				window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
				return;
			}
			if (outcome.kind === "unknown" || outcome.kind === "rejected") {
				await refreshCreditStatus();
				if (!mounted.current || readOnboardingRequestId() !== requestId) return;
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
			if (outcome.kind === "recovered") {
				setActiveSessionId(outcome.sessionId);
				await recoverCodebase();
				return;
			}
			setFeatureProjectId(null);
			// A brand new session has no server history: adopt its identity so
			// the poller cannot paint the previous attempt's state onto this one.
			adoptPayload(outcome.payload, null);
			setStep("sync");
		} catch {
			if (mounted.current && readOnboardingRequestId() === requestId)
				setError(
					"Hasil permintaan belum diketahui. Coba lagi untuk memulihkan repository yang sama.",
				);
		} finally {
			if (mounted.current && readOnboardingRequestId() === requestId) {
				createInFlight.current = false;
				setIsStarting(false);
			}
		}
	}, [
		creditStatus,
		codebase,
		recoverCodebase,
		refreshCreditStatus,
		setStep,
		setFeatureProjectId,
		adoptPayload,
	]);

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

	// Renewal cannot replace an uploaded snapshot with a new transport attempt.
	const retrySession = useCallback(async () => {
		if (!codebase || createInFlight.current || lastStatus?.snapshotId) return;
		createInFlight.current = true;
		// A retry continues an existing repository context, not a fresh start.
		setError(null);
		setIsStarting(true);
		const requestId = readOnboardingRequestId();
		try {
			const outcome = await requestRetrySession(
				codebase.id,
				activeSessionId ?? undefined,
			);
			if (
				!mounted.current ||
				readOnboardingRequestId() !== requestId ||
				readPlanCodebasePointer()?.id !== codebase.id
			)
				return;
			if (outcome.kind === "cancelled") return;
			if (outcome.kind === "failed") {
				// The repository and session are untouched. If a recoverable prompt was
				// on screen, keep it and say the new prompt failed instead of replacing
				// it with a generic sync error.
				if (promptRecovery)
					setPromptRecovery({ ...promptRecovery, failed: true });
				else setError("Sesi sync gagal dibuat. Coba lagi.");
				return;
			}
			if (outcome.kind === "recovery") {
				setActiveSessionId(outcome.sessionId);
				const recovery = promptRecoveryFromSessionCode(
					outcome.code,
					outcome.sessionId,
				);
				if (recovery) {
					// Explicitly recoverable: repository and session stay exactly as
					// they are; only a new credential is offered.
					setPromptRecovery(recovery);
					return;
				}
				// ACTIVE / UPLOADED / STALE are not failures and must not offer a
				// replacement. Re-read authoritative state instead: the CLI may have
				// connected, the upload may already be stored, or another tab may
				// have produced a newer session.
				setPromptRecovery(null);
				await recoverCodebase();
				return;
			}
			adoptPayload(outcome.payload, null);
			setStep("sync");
		} catch (error) {
			if (!mounted.current || readOnboardingRequestId() !== requestId) return;
			setError(
				error instanceof Error
					? error.message
					: "Server tidak dapat dihubungi.",
			);
		} finally {
			if (mounted.current && readOnboardingRequestId() === requestId) {
				createInFlight.current = false;
				setIsStarting(false);
			}
		}
	}, [
		codebase,
		adoptPayload,
		setStep,
		lastStatus?.snapshotId,
		activeSessionId,
		promptRecovery,
		recoverCodebase,
	]);

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
		promptRecovery,
		lastStatus,
		statusPollError,
		streamNotice,
		createCodebase,
		creditStatus,
		retrySession,
		refreshCreditStatus,
		recoverCodebase,
	};
}
