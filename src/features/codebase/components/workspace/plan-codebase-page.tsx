"use client";

import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { CodebaseConclusion } from "@/features/codebase/components/planning/codebase-conclusion";
import {
	buildLockedPrompt,
	type LockedPromptState,
} from "@/features/codebase/components/workspace/locked-prompt-state";
import { ScreenConnect } from "@/features/codebase/components/workspace/screen-connect";
import { codebaseStarterSuggestionsSchema } from "@/features/codebase/services/analysis";
import type { AnalysisCreditStatus } from "@/features/codebase/services/analysis-credit-policy";
import { CODEBASE_ONBOARDING_LABEL } from "@/features/codebase/services/library";
import type { PlanCodebaseIntent } from "@/features/codebase/services/onboarding-intent";
import { resolveCodebaseOnboardingPhase } from "@/features/codebase/services/onboarding-phase";
import {
	type PlanCodebaseStep,
	readPlanCodebasePointer,
} from "@/features/codebase/services/plan-storage";
import {
	hasReadyAnalysisForSnapshot,
	resolveOnboardingReadiness,
} from "@/features/codebase/services/workspace-readiness";
import { useUIStore } from "@/store";
import { useCodebaseOnboarding } from "../../hooks/use-codebase-onboarding";
import {
	useOnboardingAnalysis,
	useOnboardingSummaryGate,
} from "../../hooks/use-onboarding-analysis";
import { useOnboardingAnalysisState } from "../../hooks/use-onboarding-analysis-state";
import {
	CodebaseOnboardingErrorCard,
	CodebaseOnboardingLoadingCard,
} from "./plan-codebase-states";

function resolveCreditNote(status: AnalysisCreditStatus | null): string | null {
	if (!status || status.billingExempt) return null;
	if (status.code === "FREE_ALLOWANCE_AVAILABLE")
		return "Analisis awal gratis, sekali per akun.";
	return `Analisis hingga ${status.maximumCredits} kredit · ${status.availableCredits} kredit tersedia.`;
}

export function PlanCodebasePage({
	intent,
}: {
	/** Navigation intent from the route search param; absent on a bare visit. */
	intent?: PlanCodebaseIntent;
}) {
	const navigate = useNavigate();
	const step = useUIStore((s) => s.codebasePlanStep);
	const setStep = useUIStore((s) => s.setCodebasePlanStep);
	const analysisState = useOnboardingAnalysisState();
	const { analysis, analysisWorking, analysisError, isAnalysisRetrying } =
		analysisState;
	const {
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
		recoverCodebase,
	} = useCodebaseOnboarding({ analysisState, step, setStep, intent });

	const readiness = resolveOnboardingReadiness({
		snapshotId: lastStatus?.snapshotId ?? null,
		snapshotStatus: lastStatus?.status ?? null,
		analysis,
		analysisAttemptStatus: lastStatus?.analysisAttemptStatus ?? null,
		creditBlocked: Boolean(analysisState.creditStatus),
	});
	const canOpenWorkspace = readiness === "planning_ready";
	const analysisCreditCode = analysisState.creditStatus?.code ?? null;
	const isExempt = Boolean(
		analysisState.creditStatus?.billingExempt || creditStatus?.billingExempt,
	);
	const analysisBlocked =
		!isExempt &&
		(analysisCreditCode === "INSUFFICIENT_CREDITS" ||
			analysisCreditCode === "SUBSCRIPTION_PAUSED" ||
			lastStatus?.errorCode === "INSUFFICIENT_CREDITS");
	const reviewReady = hasReadyAnalysisForSnapshot(
		analysis,
		lastStatus?.snapshotId ?? null,
	);
	const isLegacyAnalysisMissingSuggestions = Boolean(
		analysis?.output &&
			lastStatus?.snapshotId &&
			analysis.snapshotId === lastStatus.snapshotId &&
			(analysis.status === "ready" || lastStatus.analysisStatus === "ready") &&
			(!analysis.output.starterSuggestions ||
				!codebaseStarterSuggestionsSchema.safeParse(
					analysis.output.starterSuggestions,
				).success),
	);
	const { canContinueToSummary } = useOnboardingSummaryGate({
		state: analysisState,
		codebase,
		lastStatus,
	});
	const { retryAnalysis, refreshLegacySuggestions } = useOnboardingAnalysis({
		state: analysisState,
		codebase,
		lastStatus,
		reviewReady,
	});

	const activeStep: PlanCodebaseStep =
		step === "summary" && !canContinueToSummary ? "sync" : step;

	// A fresh-start intent never shows the recovery loading card: there is no
	// attempt to recover, so the screen must not imply one.
	const isRecovering =
		intent !== "new" && !codebase && Boolean(readPlanCodebasePointer());

	// One mutually exclusive entry phase, so a stale credit read can never be
	// rendered next to a session that actually exists (see `onboarding-phase`).
	const phase = resolveCodebaseOnboardingPhase({
		hasPrompt: payload !== null,
		isStarting,
		creditStatus,
		error,
	});

	const lockedPrompt = useMemo<LockedPromptState | null>(
		() =>
			buildLockedPrompt(creditStatus, {
				onTopUpClose: () =>
					void (async () => {
						await refreshCreditStatus();
						if (codebase) await retrySession();
					})(),
			}),
		[creditStatus, refreshCreditStatus, codebase, retrySession],
	);

	const creditNote = resolveCreditNote(creditStatus);

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb
				current={CODEBASE_ONBOARDING_LABEL}
				ancestors={[{ label: "VibePlan", to: "/plan" }]}
			/>

			{!codebase ? (
				phase === "session_creation_failed" ? (
					<CodebaseOnboardingErrorCard
						title={
							isRecovering ? "Status repository belum dapat dibaca" : undefined
						}
						error={error ?? "Gagal menyiapkan repository."}
						onRetry={() =>
							void (readPlanCodebasePointer()
								? recoverCodebase()
								: creditStatus?.canStart
									? createCodebase()
									: refreshCreditStatus())
						}
					/>
				) : isRecovering ? (
					<CodebaseOnboardingLoadingCard
						title={
							isStarting ? "Menyiapkan sesi sync..." : "Menunggu sesi sync..."
						}
					/>
				) : (
					<ScreenConnect
						projectName=""
						payload={null}
						// A real request is in flight while eligibility is unresolved or
						// the session is being created; a blocked account runs no request,
						// so its progress line reads "Belum dimulai".
						isStarting={
							phase === "checking_eligibility" || phase === "creating_session"
						}
						status={null}
						lockedPrompt={lockedPrompt}
						creditNote={creditNote}
					/>
				)
			) : !payload && !lastStatus ? (
				error ? (
					<CodebaseOnboardingErrorCard
						error={error}
						onRetry={() => void recoverCodebase()}
					/>
				) : (
					<CodebaseOnboardingLoadingCard title="Menyiapkan instruksi CLI..." />
				)
			) : (
				<>
					{activeStep === "sync" && (
						<ScreenConnect
							projectName={codebase.name}
							payload={payload}
							isStarting={isStarting}
							status={lastStatus}
							promptError={error}
							statusError={statusPollError}
							streamNotice={streamNotice}
							onRequestNewToken={() => void retrySession()}
							onRetrySync={() => void retrySession()}
							lockedPrompt={lockedPrompt}
							creditNote={creditNote}
							canContinueToSummary={canContinueToSummary}
							onContinueToSummary={() => setStep("summary")}
							analysis={analysis}
							analysisError={analysisError}
							analysisBlocked={analysisBlocked}
							isAnalyzing={analysisWorking}
							isRetrying={isAnalysisRetrying}
							onRetryAnalysis={retryAnalysis}
							isLegacyAnalysisMissingSuggestions={
								isLegacyAnalysisMissingSuggestions
							}
							onRefreshLegacySuggestions={refreshLegacySuggestions}
						/>
					)}
					{activeStep === "summary" && lastStatus && (
						<section data-testid="codebase-sync-summary">
							<CodebaseConclusion
								snapshot={lastStatus}
								analysis={analysis}
								isAnalyzing={analysisWorking}
								errorMessage={analysisError}
								onRetryAnalysis={retryAnalysis}
								onRetrySync={() => void retrySession()}
								onEnterWorkspace={() => {
									if (!canOpenWorkspace) return;
									void navigate({
										to: "/codebases/$id",
										params: { id: codebase.id },
									});
								}}
								onBackToSync={() => setStep("sync")}
							/>
						</section>
					)}
				</>
			)}
		</main>
	);
}
