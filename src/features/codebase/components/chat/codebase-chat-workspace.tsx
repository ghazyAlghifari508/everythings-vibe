"use client";

import { Button } from "@/components/ui/button";
import { useWorkspaceChatControls } from "@/features/codebase/hooks/use-workspace-chat-controls";
import {
	type CodebasePipelineStage,
	isRunActive,
} from "@/features/codebase/services/chat-flow";
import type { WorkspaceView } from "@/features/codebase/services/workspace-hydration";
import { resolveWorkspaceHistoryView } from "../../services/workspace-hydration";
import { CodebaseChatWorkspaceArtifactsFailed } from "./codebase-chat-workspace-artifacts";
import { CodebaseChatWorkspaceComposer } from "./codebase-chat-workspace-composer";
import { CodebaseChatWorkspaceComposerDock } from "./codebase-chat-workspace-composer-dock";
import {
	buildExportPlanCommand,
	buildPlanHandoffPrompt,
} from "./codebase-chat-workspace-handoff";
import { CodebaseChatWorkspaceHeader } from "./codebase-chat-workspace-header";
import { CodebaseChatWorkspacePristine } from "./codebase-chat-workspace-pristine";
import type { CodebaseChatWorkspaceProps } from "./codebase-chat-workspace-props";
import { CodebaseRevisionReview } from "./codebase-chat-workspace-revision-review";
import { CodebaseChatWorkspaceTimeline } from "./codebase-chat-workspace-timeline";
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

export function CodebaseChatWorkspace(props: CodebaseChatWorkspaceProps) {
	const {
		featureName,
		projectId = null,
		codebaseId = null,
		isCreatingNew = false,
		view,
		planSwitcher,
		contextFiles = [],
		repositoryFiles,
		kanbanProgress = null,
		messages,
		questions,
		run = null,
		artifacts = [],
		projectIdForHandoff = null,
		stage = "questions",
		tasksUnresolved = false,
		answersReadOnly = stage !== "questions",
		composerAvailable = !projectIdForHandoff && !tasksUnresolved,
		codebaseName,
		starterSuggestions,
		composerMode = "plan",
		isSending = false,
		onSendMessage,
		onSubmitComposer,
		onComposerModeChange,
		onReferencesChange,
		onSubmitAnswer,
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
		onCloseReview,
		onApplyRevision,
		onRejectRevision,
		onRequestChangesRevision,
		onChangeRevisionTarget,
	} = props;
	// A queued operation is accepted work: the composer stays locked until it settles.
	const isRunWorking = isRunActive(run);

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

	const isPristine =
		messages.length === 0 &&
		(props.timelineEvents?.length ?? 0) === 0 &&
		questions.length === 0 &&
		artifacts.length === 0 &&
		projectIdForHandoff === null &&
		run === null &&
		!isSending &&
		stage === "questions";

	const effectiveView: WorkspaceView = resolveWorkspaceHistoryView(
		view ??
			(isPristine
				? { kind: "pristine" }
				: { kind: "active", failedArtifacts: [] }),
		props.timelineStatus ?? "ready",
	);
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
			mentionHasDocuments={controls.mentionHasDocuments}
			mentionSearchAutoFocus={controls.mentionSearchAutoFocus}
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
			onMentionSearchKeyDown={controls.handleMentionSearchKeyDown}
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
					{props.timelineStatus === "failed" ? (
						<div
							role="alert"
							className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-fog"
						>
							<span>
								Riwayat percakapan belum dapat dimuat. Dokumen tetap tersimpan.
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={props.onRetryTimeline}
							>
								Coba lagi
							</Button>
						</div>
					) : null}
					{props.timelineStatus === "pending" ? (
						<output className="px-4 py-2 text-sm text-fog">
							Memuat riwayat percakapan...
						</output>
					) : null}
					<div
						data-testid="codebase-chat-messages"
						className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
					>
						<CodebaseChatWorkspaceTimeline {...props} controls={controls} />
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
