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
	const [consentOpen, setConsentOpen] = useState(false);
	const [consentAgreed, setConsentAgreed] = useState(false);
	const queryInFlight = useRef(false);
	// Recovered status is the poller's seed, so the first paint after a refresh
	// already reflects persisted server state instead of an empty loading card.
	const [recoveredStatus, setRecoveredStatus] =
		useState<SyncStatusResponse | null>(null);
	const autoInitAttempted = useRef(false);
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
	// screens can disagree and no second poller races this one. The loop is
	// pinned to `activeSessionId`: when the user requests a new token, the id
	// changes and the poller drops the old snapshot before its first request
	// for the new session.
	const { status: lastStatus, error: statusPollError } = useCodebaseSyncStatus({
		codebaseId: codebase?.id ?? null,
		analysisProjectId: analysisState.featureProjectId,
		sessionId: activeSessionId,
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

	const blocked =
		creditStatus !== null &&
		(creditStatus.code === "INSUFFICIENT_CREDITS" ||
			creditStatus.code === "SUBSCRIPTION_PAUSED" ||
			creditStatus.code === "ANALYSIS_IN_PROGRESS");

	const refreshCreditStatus = useCallback(async () => {
		if (queryInFlight.current) return;
		queryInFlight.current = true;
		try {
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

	const requestConsent = useCallback(() => {
		if (!creditStatus) return;
		if (creditStatus.code === "FREE_ALLOWANCE_AVAILABLE") {
			setConsentAgreed(true);
			setConsentOpen(false);
			return;
		}
		if (creditStatus.code !== "CREDIT_REQUIRED") {
			setError(
				creditStatus.code === "SUBSCRIPTION_PAUSED"
					? "Perpanjang langganan di halaman Billing sebelum sinkronisasi."
					: "Kredit tidak cukup untuk analisis. Tambahkan kredit dulu.",
			);
			return;
		}
		setConsentAgreed(false);
		setConsentOpen(true);
	}, [creditStatus]);

	const closeConsent = useCallback(() => {
		setConsentOpen(false);
		setError(null);
	}, []);

	const confirmConsent = useCallback(() => {
		if (!consentAgreed) {
			setError("Centang persetujuan biaya sebelum melanjutkan.");
			return;
		}
		setConsentOpen(false);
	}, [consentAgreed]);

	const confirmed =
		creditStatus?.code === "FREE_ALLOWANCE_AVAILABLE" ||
		(creditStatus?.code === "CREDIT_REQUIRED" && consentAgreed);

	const createCodebase = useCallback(async () => {
		if (createInFlight.current) return;
		if (!creditStatus) {
			await refreshCreditStatus();
			return;
		}
		if (
			creditStatus.code !== "FREE_ALLOWANCE_AVAILABLE" &&
			creditStatus.code !== "CREDIT_REQUIRED"
		)
			return;
		if (!confirmed) {
			requestConsent();
			return;
		}
		createInFlight.current = true;
		setError(null);
		setIsStarting(true);
		try {
			const outcome = await requestCreateCodebase(
				preSyncAcceptance(creditStatus),
			);
			if (outcome.kind === "unauthorized") return;
			if (outcome.kind === "rejected") {
				setError(outcome.message);
				void refreshCreditStatus();
				return;
			}
			setCodebase(outcome.codebase);
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
		confirmed,
		requestConsent,
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
	});

	useEffect(() => {
		if (autoInitAttempted.current) return;
		autoInitAttempted.current = true;
		// Recovery reads persisted work; fresh onboarding waits for cost consent.
		if (!readPlanCodebasePointer()) {
			void refreshCreditStatus();
			return;
		}
		void (async () => {
			const recovered = await recoverCodebase();
			if (!recovered) {
				await refreshCreditStatus();
			}
		})();
	}, [recoverCodebase, refreshCreditStatus]);

	const retrySession = async () => {
		if (!codebase) return;
		if (!creditStatus || blocked) {
			await refreshCreditStatus();
			return;
		}
		if (!confirmed) {
			requestConsent();
			return;
		}
		setError(null);
		setIsStarting(true);
		try {
			const outcome = await requestRetrySession(
				codebase.id,
				preSyncAcceptance(creditStatus),
			);
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
		consentOpen,
		consentAgreed,
		setConsentAgreed,
		closeConsent,
		confirmConsent,
		refreshCreditStatus,
		blocked,
	};
}
