"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CodebaseChatWorkspace } from "@/features/codebase/components/chat/codebase-chat-workspace";
import { CodebaseArtifactCanvas } from "@/features/codebase/components/explorer/codebase-artifact-canvas";
import { CodebaseExplorerSidebar } from "@/features/codebase/components/explorer/codebase-explorer-sidebar";
import { CodebasePlanSwitcherPanel } from "@/features/codebase/components/planning/codebase-plan-switcher-panel";
import { CodebaseWorkspaceResync } from "@/features/codebase/components/workspace/codebase-workspace-resync";
import { CodebaseWorkspaceShell } from "@/features/codebase/components/workspace/codebase-workspace-shell";
import { codebaseStarterSuggestionsSchema } from "@/features/codebase/services/analysis";
import { inferArtifactTargetKind } from "@/features/codebase/services/composer-interactions";
import { canReadExistingPlans } from "@/features/codebase/services/workspace-readiness";
import { useCodebaseWorkspace } from "../../hooks/use-codebase-workspace";
import type { CodebaseWorkspaceData } from "../../services/workspace-loader.functions";
import type { CodebaseArtifactRef } from "../explorer/codebase-file-card";
import { WorkspaceConnectionScreenWrapper as ConnectionScreen } from "./workspace-connection-screen";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceScreenResolver } from "./workspace-screen-resolver";

export function CodebaseDetailPage({ data }: { data: CodebaseWorkspaceData }) {
	const { codebase, planningSnapshotByProject, canOpenFullBoard } = data;
	const ws = useCodebaseWorkspace(data);

	const {
		snapshotReady,
		resolvedFeature,
		effectiveFeatureId,
		activeArtifact,
		sourcePreview,
		isSourcePreviewOpen,
		isPrdArtifactActive,
		isAcArtifactActive,
		isTasksArtifactActive,
		isFeatureArtifactActive,
		userTookOverCanvas,
	} = ws;

	const handleReviseFromCanvas = (artifact: CodebaseArtifactRef) => {
		const kind = inferArtifactTargetKind(artifact);
		if (kind) {
			ws.setRevisionTarget(kind);
		}
		ws.setComposerMode("revise");
		const el = document.getElementById(
			"codebase-chat-composer",
		) as HTMLTextAreaElement | null;
		el?.focus();
	};

	const handleOpenTaskProgress = () => {
		if (!resolvedFeature || !ws.hasTasksInDb) return;
		userTookOverCanvas.current = true;
		ws.clearSourcePreview();
		ws.setActiveArtifactId(`tasks-${resolvedFeature.id}`);
		ws.setCanvasView("kanban");
		ws.setCanvasOpen(true);
	};

	if (snapshotReady) {
		if (!canReadExistingPlans(ws.readiness)) {
			return <ConnectionScreen name={codebase.name} ws={ws} />;
		}
		return (
			<main
				data-testid="codebase-workspace-page"
				className="flex h-dvh flex-col overflow-hidden bg-onyx text-snow"
			>
				<WorkspaceHeader
					name={codebase.name}
					isStarting={ws.isStarting}
					fileCount={ws.status?.fileCount ?? ws.manifestFileCount}
					onResync={ws.openResync}
				/>
				{ws.error && !ws.isResyncDrawerOpen && (
					<div
						role="alert"
						className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-graphite/80 bg-charcoal px-4 py-2.5 text-xs text-snow"
					>
						<div className="flex items-center gap-2 min-w-0">
							<Icon
								icon={Alert02Icon}
								size={14}
								aria-hidden="true"
								className="shrink-0 text-crimson"
							/>
							<div className="flex flex-col sm:flex-row sm:items-center gap-1 min-w-0">
								<span className="font-semibold text-snow">
									Koneksi ke server terputus:
								</span>
								<span className="text-fog truncate">{ws.error}</span>
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void ws.readStatus()}
							className="h-7 border-graphite bg-obsidian px-2.5 font-mono text-[11px] text-snow hover:bg-graphite/30"
						>
							Periksa status
						</Button>
					</div>
				)}
				<CodebaseWorkspaceResync projectName={codebase.name} ws={ws} />
				<div className="min-h-0 flex-1">
					<CodebaseWorkspaceShell
						canvasOpen={ws.canvasOpen}
						leftPane={
							<CodebaseExplorerSidebar
								files={ws.explorerFiles}
								stack={ws.explorerStack}
								codebaseId={codebase.id}
								onSelectFile={ws.selectSourceFile}
							/>
						}
						chatPane={
							<CodebaseChatWorkspace
								key={effectiveFeatureId ?? "new-feature"}
								projectId={effectiveFeatureId}
								codebaseId={codebase.id}
								isCreatingNew={ws.isCreatingNew}
								featureName={resolvedFeature?.name ?? codebase.name}
								view={ws.workspaceView}
								planSwitcher={
									ws.plans.length > 0 ? (
										<CodebasePlanSwitcherPanel
											codebaseId={codebase.id}
											plans={ws.plans}
											anchorProjectId={data.onboardingFeatureId}
											activePlanId={effectiveFeatureId}
											activePlanName={resolvedFeature?.name ?? null}
											onSelectPlan={ws.selectPlan}
											onCreateFeature={ws.handleCreateFeature}
											applyPlanMutation={ws.applyPlanMutation}
											removePlan={ws.removePlan}
										/>
									) : null
								}
								contextFiles={ws.contextFiles}
								repositoryFiles={ws.explorerFiles}
								fileCount={
									ws.status?.fileCount ?? ws.manifestFileCount ?? undefined
								}
								kanbanProgress={ws.kanbanProgress}
								messages={ws.chatMessages}
								timelineEvents={ws.timelineEvents}
								timelineStatus={ws.timelineStatus}
								onRetryTimeline={ws.refreshTimeline}
								questions={ws.aiQuestions}
								answers={ws.chatAnswers}
								run={ws.run}
								composerMode={ws.composerMode}
								onComposerModeChange={ws.setComposerMode}
								composerAvailable={ws.composerAvailable}
								answersReadOnly={ws.answersReadOnly}
								answersPersistence={{
									status: ws.saveStatus,
									error: ws.saveError,
									onRetry: () => void ws.saveAnswers(),
								}}
								artifacts={ws.artifacts}
								activeArtifactId={ws.activeArtifactId}
								projectIdForHandoff={
									ws.hasTasksInDb ? effectiveFeatureId : null
								}
								stage={ws.stage}
								stageBusy={ws.stageBusy}
								stageError={ws.stageError}
								tasksUnresolved={ws.hydration.tasks !== "empty"}
								codebaseName={codebase.name}
								planningSnapshotId={
									effectiveFeatureId
										? (planningSnapshotByProject[effectiveFeatureId] ?? null)
										: null
								}
								currentSnapshotId={ws.activeWorkspaceSnapshotId}
								pendingProposal={ws.pendingProposal}
								isReviewOpen={ws.isReviewOpen}
								isApplyingRevision={ws.isApplying}
								isRejectingRevision={ws.isRejecting}
								revisionTarget={ws.revisionTarget}
								revisionHistory={ws.history}
								onOpenReview={() => ws.setIsReviewOpen(true)}
								onCloseReview={() => ws.setIsReviewOpen(false)}
								onApplyRevision={ws.applyCurrentProposal}
								onRejectRevision={ws.rejectCurrentProposal}
								onRequestChangesRevision={ws.requestChangesCurrentProposal}
								onChangeRevisionTarget={ws.setRevisionTarget}
								onOpenTaskProgress={handleOpenTaskProgress}
								starterSuggestions={ws.analysisOutput?.starterSuggestions}
								starterRefresh={
									ws.analysis?.status === "ready" &&
									ws.analysis.output &&
									!codebaseStarterSuggestionsSchema.safeParse(
										ws.analysis.output.starterSuggestions,
									).success &&
									ws.analysis.projectId === ws.onboardingFeature?.id &&
									ws.analysis.snapshotId === ws.activeWorkspaceSnapshotId
										? {
												analysisId: ws.analysis.id,
												snapshotId: ws.analysis.snapshotId,
												status: ws.analysis.status,
												isRefreshing: ws.isRefreshingStarterSuggestions,
												error: ws.starterRefreshError,
											}
										: undefined
								}
								newerAttemptFailure={
									ws.analysis &&
									ws.status?.analysisAttemptStatus === "failed" &&
									ws.status.snapshotId === ws.analysis.snapshotId &&
									ws.status.analysisAttemptId !== ws.analysis.id
										? { errorMessage: ws.status.errorMessage ?? null }
										: null
								}
								onRefreshStarterSuggestions={ws.refreshStarterSuggestions}
								isSending={ws.isWorking}
								isConfirming={ws.isConfirming}
								specError={ws.specError}
								onOpenArtifact={(artifact) => {
									userTookOverCanvas.current = true;
									ws.clearSourcePreview();
									ws.setActiveArtifactId(artifact.id);
									if (
										resolvedFeature &&
										artifact.id === `tasks-${resolvedFeature.id}`
									) {
										ws.setCanvasView("kanban");
									}
									ws.setCanvasOpen(true);
								}}
								onDownloadArtifact={ws.handleDownloadArtifact}
								onSubmitAnswer={ws.handleSubmitAnswer}
								onSendMessage={ws.handleSendMessage}
								onSubmitComposer={ws.handleSubmitComposer}
								onConfirmGenerate={() => void ws.handleConfirmGenerate()}
								onRetryGenerate={() => void ws.handleConfirmGenerate()}
								onRetryStage={() => void ws.handleRetryStage()}
								onGeneratePrd={() => void ws.handleGeneratePrd()}
								onGenerateAc={() => void ws.handleGenerateAc()}
								onGenerateTask={() => void ws.handleGenerateTask()}
								onRetryQuestions={() => {
									if (effectiveFeatureId && ws.lastFeaturePrompt)
										void ws.fetchAiQuestions(
											effectiveFeatureId,
											ws.lastFeaturePrompt,
										);
								}}
							/>
						}
						canvasPane={
							<CodebaseArtifactCanvas
								fileName={
									isSourcePreviewOpen
										? ws.sourcePreviewPath
										: (activeArtifact?.title ??
											(isTasksArtifactActive
												? `Task · ${resolvedFeature?.name ?? codebase.name}`
												: (activeArtifact?.fileName ?? "Preview artefak")))
								}
								badge={
									isSourcePreviewOpen
										? "SUMBER"
										: (activeArtifact?.badge ?? "PRATINJAU")
								}
								contentScroll={!isTasksArtifactActive}
								hideBadge={isTasksArtifactActive}
								copyValue={ws.canvasCopy.value}
								copyLabel={ws.canvasCopy.label}
								copyUnavailableReason={ws.canvasCopy.unavailableReason}
								onClose={() => {
									userTookOverCanvas.current = true;
									ws.setCanvasOpen(false);
								}}
								onDownload={
									!isSourcePreviewOpen && activeArtifact
										? () => ws.handleDownloadArtifact(activeArtifact)
										: undefined
								}
								onRevise={
									!isSourcePreviewOpen && activeArtifact
										? () => handleReviseFromCanvas(activeArtifact)
										: undefined
								}
								isLoading={
									(sourcePreview.kind === "loading" && isSourcePreviewOpen) ||
									(isPrdArtifactActive && ws.prdLoading) ||
									(isAcArtifactActive && ws.acLoading)
								}
								error={
									isSourcePreviewOpen && sourcePreview.kind === "failed"
										? sourcePreview.message
										: isPrdArtifactActive
											? ws.prdError
											: isAcArtifactActive
												? ws.acError
												: null
								}
								onRetry={
									isSourcePreviewOpen && sourcePreview.kind === "failed"
										? () => ws.selectSourceFile(sourcePreview.path)
										: isPrdArtifactActive
											? () => void ws.loadPrd()
											: isAcArtifactActive
												? () => void ws.loadAc()
												: undefined
								}
							>
								<WorkspaceScreenResolver
									sourcePreview={sourcePreview}
									activeArtifact={activeArtifact}
									resolvedFeature={resolvedFeature}
									isPrdArtifactActive={isPrdArtifactActive}
									isAcArtifactActive={isAcArtifactActive}
									isTasksArtifactActive={isTasksArtifactActive}
									isFeatureArtifactActive={isFeatureArtifactActive}
									prdContent={ws.prdContent}
									acContent={ws.acContent}
									canvasView={ws.canvasView}
									setCanvasView={ws.setCanvasView}
									codebaseId={codebase.id}
									kanban={ws.kanban}
									canOpenFullBoard={canOpenFullBoard}
									taskTree={ws.taskTree}
									featureTree={ws.featureTree}
									snapshotId={ws.status?.snapshotId}
									planningSnapshotId={
										effectiveFeatureId
											? (planningSnapshotByProject[effectiveFeatureId] ?? null)
											: null
									}
									impactAreas={ws.analysisOutput?.impactAreas}
								/>
							</CodebaseArtifactCanvas>
						}
					/>
				</div>
			</main>
		);
	}

	return <ConnectionScreen name={codebase.name} ws={ws} />;
}
