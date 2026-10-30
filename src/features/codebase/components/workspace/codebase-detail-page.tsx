"use client";

import { CodebaseChatWorkspace } from "@/features/codebase/components/chat/codebase-chat-workspace";
import { CodebaseArtifactCanvas } from "@/features/codebase/components/explorer/codebase-artifact-canvas";
import { CodebaseExplorerSidebar } from "@/features/codebase/components/explorer/codebase-explorer-sidebar";
import { CodebasePlanSwitcher } from "@/features/codebase/components/planning/codebase-plan-switcher";
import { CodebaseWorkspaceResync } from "@/features/codebase/components/workspace/codebase-workspace-resync";
import { CodebaseWorkspaceShell } from "@/features/codebase/components/workspace/codebase-workspace-shell";
import { codebaseStarterSuggestionsSchema } from "@/features/codebase/services/analysis";
import { canReadExistingPlans } from "@/features/codebase/services/workspace-readiness";
import { useCodebaseWorkspace } from "../../hooks/use-codebase-workspace";
import type { CodebaseWorkspaceData } from "../../services/workspace-loader.functions";
import { WorkspaceConnectionScreen } from "./workspace-connection-screen";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceScreenResolver } from "./workspace-screen-resolver";

function ConnectionScreen({
	name,
	ws,
}: {
	name: string;
	ws: ReturnType<typeof useCodebaseWorkspace>;
}) {
	return (
		<WorkspaceConnectionScreen
			name={name}
			error={ws.error}
			status={ws.status}
			payload={ws.payload}
			isStarting={ws.isStarting}
			triggerAnalysis={ws.triggerAnalysis}
			startSession={ws.startSession}
			readStatus={ws.readStatus}
			readiness={ws.readiness}
			analysis={ws.analysis}
			isWorking={ws.isWorking}
			activeWorkspaceSnapshotId={ws.activeWorkspaceSnapshotId}
			manifestFileCount={ws.manifestFileCount ?? undefined}
		/>
	);
}

export function CodebaseDetailPage({ data }: { data: CodebaseWorkspaceData }) {
	const { codebase, planningSnapshotByProject, canOpenFullBoard } = data;
	const ws = useCodebaseWorkspace(data);

	const {
		snapshotReady,
		isCreatingNew,
		isStarting,
		status,
		manifestFileCount,
		setIsResyncDrawerOpen,
		payload,
		startSession,
		error,
		readStatus,
		analysis,
		isWorking,
		activeWorkspaceSnapshotId,
		canvasOpen,
		explorerFiles,
		explorerStack,
		selectSourceFile,
		resolvedFeature,
		workspaceView,
		userFacingPlans,
		effectiveFeatureId,
		selectPlan,
		handleCreateFeature,
		contextFiles,
		kanbanProgress,
		chatMessages,
		aiQuestions,
		chatAnswers,
		run,
		composerMode,
		setComposerMode,
		composerAvailable,
		answersReadOnly,
		artifacts,
		activeArtifactId,
		hasTasksInDb,
		stage,
		stageBusy,
		stageError,
		hydration,
		userTookOverCanvas,
		featureTree,
		setActiveArtifactId,
		setCanvasOpen,
		analysisOutput,
		onboardingFeature,
		isRefreshingStarterSuggestions,
		starterRefreshError,
		refreshStarterSuggestions,
		isConfirming,
		specError,
		clearSourcePreview,
		setCanvasView,
		handleDownloadArtifact,
		handleSubmitAnswer,
		handleSendMessage,
		handleSubmitComposer,
		handleConfirmGenerate,
		handleRetryStage,
		handleGeneratePrd,
		handleGenerateAc,
		handleGenerateTask,
		lastFeaturePrompt,
		fetchAiQuestions,
		isSourcePreviewOpen,
		sourcePreviewPath,
		activeArtifact,
		canvasCopy,
		sourcePreview,
		isPrdArtifactActive,
		prdLoading,
		isAcArtifactActive,
		acLoading,
		prdError,
		acError,
		loadPrd,
		loadAc,
		isTasksArtifactActive,
		canvasView,
		kanban,
		isFeatureArtifactActive,
		prdContent,
		acContent,
		taskTree,
		readiness,
		pendingProposal,
		isReviewOpen,
		setIsReviewOpen,
		isApplying,
		isRejecting,
		revisionTarget,
		setRevisionTarget,
		applyCurrentProposal,
		rejectCurrentProposal,
		requestChangesCurrentProposal,
		history,
	} = ws;

	if (snapshotReady) {
		if (!canReadExistingPlans(readiness)) {
			return <ConnectionScreen name={codebase.name} ws={ws} />;
		}
		return (
			<main
				data-testid="codebase-workspace-page"
				className="flex h-dvh flex-col overflow-hidden bg-onyx text-snow"
			>
				<WorkspaceHeader
					name={codebase.name}
					isStarting={isStarting}
					fileCount={status?.fileCount ?? manifestFileCount}
					onResync={() => {
						setIsResyncDrawerOpen(true);
						if (!payload) void startSession("retry");
					}}
				/>
				{error && (
					<div
						role="alert"
						className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-crimson/40 bg-crimson/10 px-4 py-2 text-xs text-crimson"
					>
						<span>{error}</span>
						<button
							type="button"
							onClick={() => void readStatus()}
							className="min-h-9 rounded-md border border-crimson/50 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Coba lagi
						</button>
					</div>
				)}
				<CodebaseWorkspaceResync projectName={codebase.name} ws={ws} />
				<div className="min-h-0 flex-1">
					<CodebaseWorkspaceShell
						canvasOpen={canvasOpen}
						leftPane={
							<CodebaseExplorerSidebar
								files={explorerFiles}
								stack={explorerStack}
								codebaseId={codebase.id}
								onSelectFile={selectSourceFile}
							/>
						}
						chatPane={
							<CodebaseChatWorkspace
								key={effectiveFeatureId ?? "new-feature"}
								projectId={effectiveFeatureId}
								codebaseId={codebase.id}
								isCreatingNew={isCreatingNew}
								featureName={resolvedFeature?.name ?? codebase.name}
								view={workspaceView}
								planSwitcher={
									userFacingPlans.length > 0 ? (
										<CodebasePlanSwitcher
											plans={userFacingPlans}
											activePlanId={effectiveFeatureId}
											activePlanName={resolvedFeature?.name ?? null}
											onSelectPlan={selectPlan}
											onCreateFeature={handleCreateFeature}
										/>
									) : null
								}
								contextFiles={contextFiles}
								repositoryFiles={explorerFiles}
								fileCount={status?.fileCount ?? manifestFileCount ?? undefined}
								kanbanProgress={kanbanProgress}
								messages={chatMessages}
								questions={aiQuestions}
								answers={chatAnswers}
								run={run}
								composerMode={composerMode}
								onComposerModeChange={setComposerMode}
								composerAvailable={composerAvailable}
								answersReadOnly={answersReadOnly}
								artifacts={artifacts}
								activeArtifactId={activeArtifactId}
								projectIdForHandoff={hasTasksInDb ? effectiveFeatureId : null}
								stage={stage}
								stageBusy={stageBusy}
								stageError={stageError}
								tasksUnresolved={hydration.tasks !== "empty"}
								codebaseName={codebase.name}
								planningSnapshotId={
									effectiveFeatureId
										? (planningSnapshotByProject[effectiveFeatureId] ?? null)
										: null
								}
								currentSnapshotId={activeWorkspaceSnapshotId}
								pendingProposal={pendingProposal}
								isReviewOpen={isReviewOpen}
								isApplyingRevision={isApplying}
								isRejectingRevision={isRejecting}
								revisionTarget={revisionTarget}
								revisionHistory={history}
								onOpenReview={() => setIsReviewOpen(true)}
								onCloseReview={() => setIsReviewOpen(false)}
								onApplyRevision={applyCurrentProposal}
								onRejectRevision={rejectCurrentProposal}
								onRequestChangesRevision={requestChangesCurrentProposal}
								onChangeRevisionTarget={setRevisionTarget}
								onReviewPlan={() => {
									userTookOverCanvas.current = true;
									if (resolvedFeature && featureTree) {
										setActiveArtifactId(`feature-${resolvedFeature.id}`);
										setCanvasOpen(true);
									}
								}}
								starterSuggestions={analysisOutput?.starterSuggestions}
								starterRefresh={
									analysis?.status === "ready" &&
									analysis.output &&
									!codebaseStarterSuggestionsSchema.safeParse(
										analysis.output.starterSuggestions,
									).success &&
									analysis.projectId === onboardingFeature?.id &&
									analysis.snapshotId === activeWorkspaceSnapshotId
										? {
												analysisId: analysis.id,
												snapshotId: analysis.snapshotId,
												status: analysis.status,
												isRefreshing: isRefreshingStarterSuggestions,
												error: starterRefreshError,
											}
										: undefined
								}
								newerAttemptFailure={
									analysis &&
									status?.analysisAttemptStatus === "failed" &&
									status.snapshotId === analysis.snapshotId &&
									status.analysisAttemptId !== analysis.id
										? { errorMessage: status.errorMessage ?? null }
										: null
								}
								onRefreshStarterSuggestions={refreshStarterSuggestions}
								isSending={isWorking}
								isConfirming={isConfirming}
								specError={specError}
								onOpenArtifact={(artifact) => {
									userTookOverCanvas.current = true;
									clearSourcePreview();
									setActiveArtifactId(artifact.id);
									if (
										resolvedFeature &&
										artifact.id === `tasks-${resolvedFeature.id}`
									) {
										setCanvasView("kanban");
									}
									setCanvasOpen(true);
								}}
								onDownloadArtifact={handleDownloadArtifact}
								onSubmitAnswer={handleSubmitAnswer}
								onSendMessage={handleSendMessage}
								onSubmitComposer={handleSubmitComposer}
								onConfirmGenerate={() => void handleConfirmGenerate()}
								onRetryGenerate={() => void handleConfirmGenerate()}
								onRetryStage={() => void handleRetryStage()}
								onGeneratePrd={() => void handleGeneratePrd()}
								onGenerateAc={() => void handleGenerateAc()}
								onGenerateTask={() => void handleGenerateTask()}
								onRetryQuestions={() => {
									if (effectiveFeatureId && lastFeaturePrompt)
										void fetchAiQuestions(
											effectiveFeatureId,
											lastFeaturePrompt,
										);
								}}
							/>
						}
						canvasPane={
							<CodebaseArtifactCanvas
								fileName={
									isSourcePreviewOpen
										? sourcePreviewPath
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
								copyValue={canvasCopy.value}
								copyLabel={canvasCopy.label}
								copyUnavailableReason={canvasCopy.unavailableReason}
								onClose={() => {
									userTookOverCanvas.current = true;
									setCanvasOpen(false);
								}}
								onDownload={
									!isSourcePreviewOpen && activeArtifact
										? () => handleDownloadArtifact(activeArtifact)
										: undefined
								}
								isLoading={
									(sourcePreview.kind === "loading" && isSourcePreviewOpen) ||
									(isPrdArtifactActive && prdLoading) ||
									(isAcArtifactActive && acLoading)
								}
								error={
									isSourcePreviewOpen && sourcePreview.kind === "failed"
										? sourcePreview.message
										: isPrdArtifactActive
											? prdError
											: isAcArtifactActive
												? acError
												: null
								}
								onRetry={
									isSourcePreviewOpen && sourcePreview.kind === "failed"
										? () => selectSourceFile(sourcePreview.path)
										: isPrdArtifactActive
											? () => void loadPrd()
											: isAcArtifactActive
												? () => void loadAc()
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
									prdContent={prdContent}
									acContent={acContent}
									canvasView={canvasView}
									setCanvasView={setCanvasView}
									codebaseId={codebase.id}
									kanban={kanban}
									canOpenFullBoard={canOpenFullBoard}
									taskTree={taskTree}
									featureTree={featureTree}
									snapshotId={status?.snapshotId}
									impactAreas={analysisOutput?.impactAreas}
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
