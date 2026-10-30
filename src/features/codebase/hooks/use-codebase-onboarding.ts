import { useCallback, useEffect, useRef, useState } from "react";
import { useCodebaseSyncStatus } from "@/features/codebase/hooks/use-codebase-sync-status";
import {
	clearPlanCodebaseProjectPointer,
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
import {
	preSyncAcceptance,
	requestAnalysisCreditPreflight,
} from "../services/analysis-credit-requests";
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
}: {
	analysisState: OnboardingAnalysisState;
	step: PlanCodebaseStep;
	setStep: (step: PlanCodebaseStep) => void;
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
	// Recovered status is the poller's seed, so the first paint after a refresh
	// already reflects persisted server state instead of an empty loading card.
	const [recoveredStatus, setRecoveredStatus] =
		useState<SyncStatusResponse | null>(null);
	const autoInitAttempted = useRef(false);
	// and two sync sessions for one onboarding attempt. State updates are async,
	// so a ref is what actually closes the window.
	const createInFlight = useRef(false);

	// One canonical reconciliation loop for the whole onboarding flow. The
	// prompt screen needs the CLI handshake, the sync screen needs the transport
	// stages, and the conclusion screen needs the persisted analysis status — all
	// three read this single snapshot, so no two screens can disagree and no
	// second poller races this one.
	const { status: lastStatus, error: statusPollError } = useCodebaseSyncStatus({
		codebaseId: codebase?.id ?? null,
		analysisProjectId: analysisState.featureProjectId,
		initialStatus: recoveredStatus,
		enabled: codebase !== null,
	});

	useEffect(() => {
		setStep("sync");
	}, [setStep]);

	// Persist the navigation intent, never the domain state: a refresh returns
	// the user to the screen they were reading, and recovery re-validates it
	// against the server snapshot instead of trusting it.
	useEffect(() => {
		if (!codebase) return;
		storePlanCodebaseStepPointer(step);
	}, [codebase, step]);

	const createCodebase = useCallback(async () => {
		if (createInFlight.current) return;
		createInFlight.current = true;
		setError(null);
		setIsStarting(true);
		try {
			if (!creditStatus) {
				setCreditStatus(await requestAnalysisCreditPreflight());
				return;
			}
			if (
				creditStatus.code !== "FREE_ALLOWANCE_AVAILABLE" &&
				creditStatus.code !== "CREDIT_REQUIRED"
			)
				return;
			const outcome = await requestCreateCodebase(
				preSyncAcceptance(creditStatus),
			);
			if (outcome.kind === "unauthorized") return;
			if (outcome.kind === "rejected") {
				setError(outcome.message);
				return;
			}
			setCodebase(outcome.codebase);
			clearPlanCodebaseProjectPointer();
			setFeatureProjectId(null);
			setAnalysis(null);
			setAnalysisError(null);
			analysisAttemptedFor.current = null;
			setPayload(outcome.payload);
			// A brand new session has no server history: clear the seed so the
			// poller cannot paint the previous attempt's state onto this one.
			setRecoveredStatus(null);
			setStep("sync");
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			createInFlight.current = false;
			setIsStarting(false);
		}
	}, [
		creditStatus,
		setStep,
		setFeatureProjectId,
		setAnalysis,
		setAnalysisError,
		analysisAttemptedFor,
	]);

	const recoverCodebase = useOnboardingRecovery({
		analysisState,
		setError,
		setIsStarting,
		setCodebase,
		setRecoveredStatus,
		setPayload,
		setStep,
	});

	useEffect(() => {
		if (autoInitAttempted.current) return;
		autoInitAttempted.current = true;
		// Recovery reads persisted work; fresh onboarding waits for cost consent.
		if (!readPlanCodebasePointer()) {
			void requestAnalysisCreditPreflight()
				.then(setCreditStatus)
				.catch((error: unknown) =>
					setError(
						error instanceof Error
							? error.message
							: "Kebutuhan kredit belum dapat diperiksa.",
					),
				);
			return;
		}
		void (async () => {
			const recovered = await recoverCodebase();
			if (!recovered) {
				try {
					setCreditStatus(await requestAnalysisCreditPreflight());
				} catch {
					setError("Kebutuhan kredit belum dapat diperiksa. Coba muat ulang.");
				}
			}
		})();
	}, [recoverCodebase]);

	const retrySession = async () => {
		if (!codebase) return;
		setError(null);
		setIsStarting(true);
		try {
			const outcome = await requestRetrySession(codebase.id);
			if (outcome.kind === "cancelled") return;
			if (outcome.kind === "failed") {
				setError("Sesi sync gagal dibuat. Coba lagi.");
				return;
			}
			setPayload(outcome.payload);
			setRecoveredStatus(null);
			setAnalysis(null);
			setAnalysisError(null);
			analysisAttemptedFor.current = null;
			setStep("sync");
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "Server tidak dapat dihubungi.",
			);
		} finally {
			setIsStarting(false);
		}
	};

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
		createCodebase,
		creditStatus,
		retrySession,
	};
}
