"use client";

import { useWorkspaceChatControls } from "@/features/codebase/hooks/use-workspace-chat-controls";
import {
	areAllQuestionsAnswered,
	type CodebasePipelineStage,
	nextQuestionIndex,
} from "@/features/codebase/services/chat-flow";
import type { WorkspaceView } from "@/features/codebase/services/workspace-hydration";
import {
	CodebaseChatWorkspaceArtifactStream,
	CodebaseChatWorkspaceArtifactsFailed,
} from "./codebase-chat-workspace-artifacts";
import { CodebaseChatWorkspaceComposer } from "./codebase-chat-workspace-composer";
import { CodebaseChatWorkspaceComposerDock } from "./codebase-chat-workspace-composer-dock";
import {
	CodebaseChatWorkspaceSpecError,
	CodebaseChatWorkspaceStageError,
} from "./codebase-chat-workspace-error-rows";
import {
	buildExportPlanCommand,
	buildPlanHandoffPrompt,
	CodebaseChatWorkspaceHandoffCard,
} from "./codebase-chat-workspace-handoff";
import { CodebaseChatWorkspaceHeader } from "./codebase-chat-workspace-header";
import { CodebaseChatWorkspaceMessages } from "./codebase-chat-workspace-messages";
import { CodebaseChatWorkspacePristine } from "./codebase-chat-workspace-pristine";
import type { CodebaseChatWorkspaceProps } from "./codebase-chat-workspace-props";
import {
	CodebaseChatWorkspaceQuestions,
	CodebaseChatWorkspaceQuestionsComplete,
} from "./codebase-chat-workspace-questions";
import { CodebaseChatWorkspacePendingRevisionBanner } from "./codebase-chat-workspace-revision-controls";
import { CodebaseRevisionReview } from "./codebase-chat-workspace-revision-review";
import { CodebaseChatWorkspaceStageHandoffs } from "./codebase-chat-workspace-stage-handoffs";
import {
	CodebaseChatWorkspaceLoading,
	CodebaseChatWorkspacePlanSelection,
	CodebaseChatWorkspacePlanUnavailable,
} from "./codebase-chat-workspace-view-states";

export type {
	AdaptiveQuestion,
	AdaptiveQuestionOption,
} from "@/features/codebase/services/chat-flow";
export type { ChatStreamMessage } from "./codebase-chat-workspace-messages";
export { buildExportPlanCommand, buildPlanHandoffPrompt };

/** Workspace pipeline position; the canonical union lives in the flow module. */
export type PipelineStage = CodebasePipelineStage;

export function CodebaseChatWorkspace({
	featureName,
	projectId = null,
	codebaseId = null,
	isCreatingNew = false,
	view,
	planSwitcher,
	contextFiles = [],
	repositoryFiles,
	fileCount: _fileCount,
	kanbanProgress = null,
	messages,
	questions,
	answers,
	run = null,
	artifacts = [],
	activeArtifactId = null,
	projectIdForHandoff = null,
	stage = "questions",
	stageBusy = null,
	stageError = null,
	tasksUnresolved = false,
	answersReadOnly = stage !== "questions",
	composerAvailable = !projectIdForHandoff && !tasksUnresolved,
	codebaseName,
	starterSuggestions,
	composerMode = "plan",
	isSending = false,
	isConfirming = false,
	specError = null,
	onOpenArtifact,
	onDownloadArtifact,
	onSubmitAnswer,
	onSendMessage,
	onSubmitComposer,
	onComposerModeChange,
	onReferencesChange,
	onConfirmGenerate,
	onRetryQuestions,
	onRetryGenerate,
	onRetryStage,
	onGeneratePrd,
	onGenerateAc,
	onGenerateTask,
	starterRefresh,
	newerAttemptFailure,
	onRefreshStarterSuggestions,
	planningSnapshotId = null,
	currentSnapshotId = null,
	onReviewPlan,
	pendingProposal,
	isReviewOpen = false,
	isApplyingRevision = false,
	isRejectingRevision = false,
	revisionTarget = "prd",
	revisionHistory = [],
	onOpenReview,
	onCloseReview,
	onApplyRevision,
	onRejectRevision,
	onRequestChangesRevision,
	onChangeRevisionTarget,
}: CodebaseChatWorkspaceProps) {
	const tasksArtifact = artifacts.find((item) => item.id.startsWith("tasks-"));
	const isRunWorking = run?.status === "running";

	const controls = useWorkspaceChatControls({
		projectId,
		projectIdForHandoff,
		featureName,
		codebaseId,
		codebaseName,
		currentSnapshotId,
		stage,
		isCreatingNew,
		composerAvailable,
		composerMode,
		revisionTarget,
		artifacts,
		repositoryFiles,
		contextFiles,
		isSending,
		isRunWorking,
		answersReadOnly,
		onSendMessage,
		onSubmitComposer,
		onComposerModeChange,
		onChangeRevisionTarget,
		onReferencesChange,
		onSubmitAnswer,
	});

	const currentIndex = nextQuestionIndex(answers, questions);
	const visibleQuestions =
		questions.length === 0
			? []
			: currentIndex === -1
				? questions
				: questions.slice(0, currentIndex + 1);
	const flowComplete = areAllQuestionsAnswered(answers, questions);

	const isPristine =
		messages.length === 0 &&
		questions.length === 0 &&
		artifacts.length === 0 &&
		projectIdForHandoff === null &&
		run === null &&
		!isSending &&
		stage === "questions";

	const effectiveView: WorkspaceView =
		view ??
		(isPristine
			? { kind: "pristine" }
			: { kind: "active", failedArtifacts: [] });
	const showPristine = effectiveView.kind === "pristine";
	const showLoading = effectiveView.kind === "loading";
	const showPlanUnavailable = effectiveView.kind === "plan_unavailable";
	const showPlanSelection = effectiveView.kind === "needs_plan_selection";
	const failedArtifacts =
		effectiveView.kind === "active" ? effectiveView.failedArtifacts : [];

	const planningMovedOn = Boolean(
		planningSnapshotId &&
			currentSnapshotId &&
			planningSnapshotId !== currentSnapshotId,
	);

	const runFailed = run?.status === "failed";
	const stageErrorVisible = Boolean(stageError) && !runFailed;
	const activeSpecError =
		(run?.stage === "feature" && runFailed ? run.error : null) ?? specError;
	const specErrorVisible = Boolean(activeSpecError);

	const composerPlaceholder =
		controls.activeMode === "revise"
			? "Jelaskan perubahan yang kamu inginkan..."
			: "Jelaskan fitur baru yang kamu inginkan...";

	const renderComposer = (minRows = 1, className = "") => (
		<CodebaseChatWorkspaceComposer
			draft={controls.draft}
			onDraftChange={controls.setDraft}
			onSend={controls.handleSend}
			onKeyDown={controls.handleComposerKeyDown}
			isSending={isSending || isRunWorking}
			sendDisabled={controls.sendDisabled}
			minRows={minRows}
			className={className}
			placeholder={composerPlaceholder}
			mode={controls.activeMode}
			canSwitchToPlan={controls.canSwitchToPlan}
			targetKind={controls.effectiveTargetKind}
			targetArtifact={controls.effectiveTargetArtifact}
			featureName={featureName}
			references={controls.reconciledReferences}
			lockedNotice={controls.lockedNotice}
			isMentionOpen={controls.isMentionPopoverOpen}
			mentionSearch={controls.mentionSearch}
			mentionDocuments={controls.mentionDocuments}
			mentionFiles={controls.mentionFiles}
			mentionActiveIndex={controls.mentionActiveIndex}
			isSlashOpen={controls.isSlashPopoverOpen}
			slashCommands={controls.slashCommands}
			slashActiveIndex={controls.slashActiveIndex}
			isHelpOpen={controls.isHelpOpen}
			allSlashCommands={controls.allSlashCommands}
			onSelectMode={controls.handleSelectMode}
			onToggleMention={controls.handleToggleMention}
			onCloseMention={controls.handleCloseMention}
			onMentionSearchChange={controls.setMentionSearch}
			onSelectMentionCandidate={controls.handleSelectMentionCandidate}
			onRemoveReference={controls.handleRemoveReference}
			onSelectSlashCommand={controls.handleSelectSlashCommand}
			onCloseHelp={() => controls.setIsHelpOpen(false)}
			onDismissNotice={() => controls.setLockedNotice(null)}
		/>
	);

	return (
		<div
			data-testid="codebase-chat-workspace"
			className="flex h-full min-h-0 flex-col bg-onyx"
		>
			<CodebaseChatWorkspaceHeader
				codebaseName={codebaseName}
				featureName={featureName}
				planSwitcher={planSwitcher}
				kanbanProgress={kanbanProgress}
				planningMovedOn={planningMovedOn}
				onReviewPlan={onReviewPlan}
			/>
			{showLoading ? (
				<CodebaseChatWorkspaceLoading />
			) : showPlanUnavailable ? (
				<CodebaseChatWorkspacePlanUnavailable />
			) : showPlanSelection ? (
				<CodebaseChatWorkspacePlanSelection />
			) : showPristine ? (
				<CodebaseChatWorkspacePristine
					newFeatureRepository={isCreatingNew ? codebaseName : undefined}
					composer={renderComposer(2, "p-3.5 sm:p-4")}
					starterSuggestions={starterSuggestions}
					starterRefresh={starterRefresh}
					newerAttemptFailure={newerAttemptFailure}
					onRefreshStarterSuggestions={onRefreshStarterSuggestions}
					onPrefillDraft={controls.handlePrefillDraft}
				/>
			) : (
				<>
					<CodebaseChatWorkspaceArtifactsFailed
						failedArtifacts={failedArtifacts}
					/>
					<div
						data-testid="codebase-chat-messages"
						className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
					>
						<div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
							<CodebaseChatWorkspaceMessages
								messages={messages}
								run={run}
								onRetryQuestions={onRetryQuestions}
								onRetryStage={onRetryStage}
								onRetryGenerate={onRetryGenerate}
							/>
							<CodebaseChatWorkspaceQuestions
								visibleQuestions={visibleQuestions}
								totalQuestions={questions.length}
								answers={answers}
								currentIndex={currentIndex}
								editingQuestionId={
									answersReadOnly ? null : controls.editingQuestionId
								}
								readOnly={answersReadOnly}
								onEditQuestion={controls.handleEditQuestion}
								onCancelEdit={controls.handleCancelEditQuestion}
								onSubmit={controls.handleSubmitAnswer}
							/>
							<CodebaseChatWorkspaceArtifactStream
								artifacts={artifacts}
								activeArtifactId={activeArtifactId}
								stage={stage}
								onOpenArtifact={onOpenArtifact}
								onDownloadArtifact={onDownloadArtifact}
							/>
							<CodebaseChatWorkspacePendingRevisionBanner
								proposal={pendingProposal}
								onOpenReview={onOpenReview}
							/>
							{specErrorVisible ? (
								<CodebaseChatWorkspaceSpecError
									message={activeSpecError}
									onRetry={onRetryGenerate}
								/>
							) : null}
							{flowComplete &&
							!answersReadOnly &&
							stage === "questions" &&
							!specErrorVisible ? (
								<CodebaseChatWorkspaceQuestionsComplete
									isConfirming={isConfirming}
									onConfirmGenerate={onConfirmGenerate}
								/>
							) : null}
							{stageErrorVisible ? (
								<CodebaseChatWorkspaceStageError
									message={stageError}
									onRetry={onRetryStage}
								/>
							) : null}
							<CodebaseChatWorkspaceStageHandoffs
								stage={stage}
								stageBusy={stageBusy}
								tasksUnresolved={tasksUnresolved}
								artifacts={artifacts}
								onGeneratePrd={onGeneratePrd}
								onGenerateAc={onGenerateAc}
								onGenerateTask={onGenerateTask}
								onOpenArtifact={onOpenArtifact}
								onDownloadArtifact={onDownloadArtifact}
							/>
							{controls.handoffPrompt && controls.exportCmd ? (
								<CodebaseChatWorkspaceHandoffCard
									exportCmd={controls.exportCmd}
									taskCount={kanbanProgress?.total}
									onOpenKanban={
										tasksArtifact && onOpenArtifact
											? () => onOpenArtifact(tasksArtifact)
											: undefined
									}
									handoffPrompt={controls.handoffPrompt}
									codebaseName={codebaseName}
									copiedCmd={controls.copiedCmd}
									copiedExport={controls.copiedExport}
									onCopyCmd={controls.handleCopyCmd}
									onCopyExport={() =>
										controls.handleCopy(controls.exportCmd ?? "", (value) =>
											controls.setCopiedExport(value),
										)
									}
									isRevisingCompletedPlan={controls.isCompletedRevisionOpen}
									onStartCompletedRevision={controls.openCompletedRevision}
									onCancelCompletedRevision={controls.cancelCompletedRevision}
								/>
							) : null}
						</div>
					</div>
					{controls.effectiveComposerAvailable ? (
						<CodebaseChatWorkspaceComposerDock
							composerMode={controls.activeMode}
							revisionTarget={controls.effectiveTargetKind}
							revisionHistory={revisionHistory}
							isRevisingCompletedPlan={controls.isCompletedRevisionOpen}
							onChangeRevisionTarget={controls.handleChangeRevisionTarget}
							onCancelCompletedRevision={controls.cancelCompletedRevision}
							composer={renderComposer(2, "p-3 sm:p-3.5")}
						/>
					) : null}
				</>
			)}
			<CodebaseRevisionReview
				isOpen={Boolean(isReviewOpen && pendingProposal)}
				onClose={onCloseReview ?? (() => {})}
				proposal={pendingProposal ?? null}
				isApplying={Boolean(isApplyingRevision)}
				isRejecting={Boolean(isRejectingRevision)}
				onApply={onApplyRevision ?? (() => {})}
				onReject={onRejectRevision ?? (() => {})}
				onRequestChanges={onRequestChangesRevision}
				onPrefillDraft={controls.handlePrefillDraft}
			/>
		</div>
	);
}
