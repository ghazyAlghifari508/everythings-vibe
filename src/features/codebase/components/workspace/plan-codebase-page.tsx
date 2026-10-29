"use client";

import { useNavigate } from "@tanstack/react-router";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { CodebaseConclusion } from "@/features/codebase/components/planning/codebase-conclusion";
import { ScreenConnect } from "@/features/codebase/components/workspace/screen-connect";
import { codebaseStarterSuggestionsSchema } from "@/features/codebase/services/analysis";
import { CODEBASE_ONBOARDING_LABEL } from "@/features/codebase/services/library";
import type { PlanCodebaseStep } from "@/features/codebase/services/plan-storage";
import {
	isSyncStatusComplete,
	SNAPSHOT_CONTEXT_STATUSES,
} from "@/features/codebase/services/sync";
import { useUIStore } from "@/store";
import { useCodebaseOnboarding } from "../../hooks/use-codebase-onboarding";
import {
	useOnboardingAnalysis,
	useOnboardingSummaryGate,
} from "../../hooks/use-onboarding-analysis";
import { useOnboardingAnalysisState } from "../../hooks/use-onboarding-analysis-state";
import { AnalysisCreditNotice } from "./analysis-credit-notice";
import {
	CodebaseOnboardingErrorCard,
	CodebaseOnboardingLoadingCard,
} from "./plan-codebase-states";

export function PlanCodebasePage() {
	const navigate = useNavigate();
	const step = useUIStore((s) => s.codebasePlanStep);
	const setStep = useUIStore((s) => s.setCodebasePlanStep);
	const analysisState = useOnboardingAnalysisState();
	const { analysis, analysisWorking, analysisError } = analysisState;
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
	} = useCodebaseOnboarding({ analysisState, step, setStep });

	// Two independent capabilities, deliberately not collapsed into one
	// `isReady`: the workspace opens as soon as sync produced a usable
	// snapshot, while the review conclusion additionally requires validated
	// analysis output for that exact snapshot.
	//
	// `reviewReady` mirrors the workspace canRenderCodebaseReview predicate; a
	// snapshot alone never counts as a review.
	const canOpenWorkspace = isSyncStatusComplete(lastStatus);
	const reviewReady = Boolean(
		analysis?.output &&
			lastStatus?.snapshotId &&
			analysis.snapshotId === lastStatus.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(lastStatus.status),
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

	// The conclusion step is never rendered without a usable current snapshot for
	// this attempt. Without this guard a stale step pointer or a direct jump
	// would show a summary for work that cannot start; the user is returned to
	// the sync step, which reports the real state instead.
	const activeStep: PlanCodebaseStep =
		step === "summary" && !canContinueToSummary ? "sync" : step;

	// Onboarding states are mutually exclusive. A terminal create failure must
	// never render beside a "waiting for session" spinner: the spinner claims a
	// request is still in flight after it has already failed, which is exactly
	// the state the user cannot act on. Derived from `codebase` first so the
	// ready branch keeps its non-null narrowing.
	const onboardingFailed = !codebase && !isStarting && error !== null;

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
				) : creditStatus ? (
					<>
						<AnalysisCreditNotice
							status={creditStatus}
							onStart={() => void createCodebase()}
							isStarting={isStarting}
						/>
						{error && (
							<p role="alert" className="text-sm text-snow">
								{error}
							</p>
						)}
					</>
				) : (
					<CodebaseOnboardingLoadingCard
						title={
							isStarting ? "Menyiapkan sesi sync..." : "Menunggu sesi sync..."
						}
					/>
				)
			) : !payload && !lastStatus ? (
				// A codebase exists but neither its prompt payload nor a polled
				// status has landed yet. Still initializing, not an error.
				<CodebaseOnboardingLoadingCard title="Menyiapkan instruksi CLI..." />
			) : (
				<>
					{analysisState.creditStatus && (
						<AnalysisCreditNotice
							status={analysisState.creditStatus}
							onStart={retryAnalysis}
							isStarting={analysisWorking}
							analysisOnly
						/>
					)}
					{/* Step 1 owns the whole sync lifecycle: the prompt, the agent, and
					the live server status of the upload it started. There is no second
					screen to navigate to in order to see the same progress. */}
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
							isAnalyzing={analysisWorking}
							onRetryAnalysis={retryAnalysis}
							isLegacyAnalysisMissingSuggestions={
								isLegacyAnalysisMissingSuggestions
							}
							onRefreshLegacySuggestions={refreshLegacySuggestions}
						/>
					)}
					{/* Step 2 owns every analysis state. Pending becomes the canonical
					review in this same region once the server reports it, so there is
					no manual step between the two. */}
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
