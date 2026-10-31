"use client";

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { TopUpModal } from "@/features/billing/components/top-up-modal";
import { CodebaseConclusion } from "@/features/codebase/components/planning/codebase-conclusion";
import { ScreenConnect } from "@/features/codebase/components/workspace/screen-connect";
import { codebaseStarterSuggestionsSchema } from "@/features/codebase/services/analysis";
import { CODEBASE_ONBOARDING_LABEL } from "@/features/codebase/services/library";
import type { PlanCodebaseStep } from "@/features/codebase/services/plan-storage";
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
import { CodebaseOnboardingShell } from "./codebase-onboarding-shell";
import { CreditConsentDialog } from "./credit-consent-dialog";
import {
	CodebaseOnboardingErrorCard,
	CodebaseOnboardingLoadingCard,
} from "./plan-codebase-states";

export function PlanCodebasePage() {
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
	} = useCodebaseOnboarding({ analysisState, step, setStep });
	const [consentError, setConsentError] = useState<string | null>(null);
	const [topUpOpen, setTopUpOpen] = useState(false);

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

	const onboardingFailed = !codebase && !isStarting && error !== null;

	const handleTopUpClose = (open: boolean) => {
		setTopUpOpen(open);
		if (!open) void refreshCreditStatus();
	};

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb
				current={CODEBASE_ONBOARDING_LABEL}
				ancestors={[{ label: "VibePlan", to: "/plan" }]}
			/>

			{!codebase ? (
				onboardingFailed ? (
					<CodebaseOnboardingErrorCard
						error={error}
						onRetry={() => void createCodebase()}
					/>
				) : blocked && creditStatus ? (
					<CodebaseOnboardingShell
						projectName={null}
						creditStatus={creditStatus}
						isStarting={isStarting}
						createError={error}
						onTopUp={() => setTopUpOpen(true)}
					/>
				) : creditStatus &&
					(creditStatus.code === "FREE_ALLOWANCE_AVAILABLE" ||
						creditStatus.code === "CREDIT_REQUIRED") ? (
					<CodebaseOnboardingShell
						projectName={null}
						creditStatus={creditStatus}
						isStarting={isStarting}
						createError={error}
						onStart={() => void createCodebase()}
					/>
				) : (
					<CodebaseOnboardingLoadingCard
						title={
							isStarting ? "Menyiapkan sesi sync..." : "Menunggu sesi sync..."
						}
					/>
				)
			) : !payload && !lastStatus ? (
				<CodebaseOnboardingLoadingCard title="Menyiapkan instruksi CLI..." />
			) : (
				<>
					{activeStep === "sync" && (
						<ScreenConnect
							projectName={codebase.name}
							payload={payload}
							isStarting={isStarting}
							status={lastStatus}
							statusError={statusPollError}
							onRequestNewToken={() => void retrySession()}
							onRetrySync={() => void retrySession()}
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
			{!creditStatus?.billingExempt &&
				creditStatus &&
				(creditStatus.code === "FREE_ALLOWANCE_AVAILABLE" ||
					creditStatus.code === "CREDIT_REQUIRED") && (
					<CreditConsentDialog
						open={consentOpen}
						onOpenChange={(open) => {
							if (!open) closeConsent();
						}}
						status={creditStatus}
						agreed={consentAgreed}
						onAgreedChange={setConsentAgreed}
						error={consentError}
						onConfirm={() => {
							if (!consentAgreed) {
								setConsentError(
									"Centang persetujuan biaya sebelum melanjutkan.",
								);
								return;
							}
							setConsentError(null);
							confirmConsent();
							setTimeout(() => void createCodebase(), 0);
						}}
						isStarting={isStarting}
					/>
				)}
			<TopUpModal open={topUpOpen} onOpenChange={handleTopUpClose} />
		</main>
	);
}
