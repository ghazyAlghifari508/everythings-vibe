"use client";

import { useState } from "react";
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
	isCreatingNew = false,
	view,
	planSwitcher,
	contextFiles: _contextFiles = [],
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
	composerMode = "create",
	isSending = false,
	isConfirming = false,
	specError = null,
	onOpenArtifact,
	onDownloadArtifact,
	onSubmitAnswer,
	onSendMessage,
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
}: CodebaseChatWorkspaceProps) {
	const [draft, setDraft] = useState("");
	const [copiedCmd, setCopiedCmd] = useState(false);
	const [copiedExport, setCopiedExport] = useState(false);
	const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
		null,
	);

	const tasksArtifact = artifacts.find((item) => item.id.startsWith("tasks-"));
	const exportCmd = projectIdForHandoff
		? buildExportPlanCommand(projectIdForHandoff)
		: null;
	const handoffPrompt = projectIdForHandoff
		? buildPlanHandoffPrompt(projectIdForHandoff, codebaseName ?? null)
		: null;

	const handleCopyCmd = async () => {
		if (!handoffPrompt) return;
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(handoffPrompt);
			setCopiedCmd(true);
			setTimeout(() => setCopiedCmd(false), 2000);
		} catch {
			return;
		}
	};

	const handleCopy = async (
		text: string,
		setState: (value: boolean) => void,
	) => {
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(text);
			setState(true);
			setTimeout(() => setState(false), 2000);
		} catch {
			return;
		}
	};

	const handleSend = (text?: string) => {
		const message = (text ?? draft).trim();
		if (!composerAvailable || message.length < 3 || isSending || isRunWorking)
			return;
		const accepted = onSendMessage?.(message);
		if (accepted instanceof Promise) {
			void accepted.then((success) => {
				if (success) setDraft("");
			});
		} else if (accepted !== false) setDraft("");
	};

	const handlePrefillDraft = (text: string) => {
		setDraft(text);
		const composerEl = document.getElementById(
			"codebase-chat-composer",
		) as HTMLTextAreaElement | null;
		if (composerEl) {
			composerEl.focus();
			const len = text.length;
			composerEl.setSelectionRange?.(len, len);
		}
	};

	const handleEditQuestion = (questionId: string) => {
		if (!answersReadOnly) setEditingQuestionId(questionId);
	};
	const handleCancelEditQuestion = () => setEditingQuestionId(null);
	const handleSubmitAnswer = (questionId: string, answer: string) => {
		if (answersReadOnly) return;
		setEditingQuestionId(null);
		onSubmitAnswer?.(questionId, answer);
	};

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

	/**
	 * The view the caller derived from the resolved plan and the real artifact
	 * hydration statuses. When a caller does not supply one — tests and the
	 * standalone body render — it is derived from the props above, which keeps
	 * the previous behaviour without letting a pending read look like an empty
	 * repository.
	 */
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

	// Only a repository that moved on after this plan was written is reported as
	// needing review. Both ids must be real, and the notice is informational: the
	// user opens the stored plan, nothing is regenerated and no credit is spent.
	const planningMovedOn = Boolean(
		planningSnapshotId &&
			currentSnapshotId &&
			planningSnapshotId !== currentSnapshotId,
	);

	const isRunWorking = run?.status === "running";
	const runFailed = run?.status === "failed";
	// A failed request owns its own error row, so the generic stage error
	// row must not render a second, duplicate message for the same failure.
	const stageErrorVisible = Boolean(stageError) && !runFailed;
	const activeSpecError =
		(run?.stage === "feature" && runFailed ? run.error : null) ?? specError;
	const specErrorVisible = Boolean(activeSpecError);

	const composerPlaceholder =
		composerMode === "create"
			? "Jelaskan fitur baru yang kamu inginkan..."
			: "Jelaskan perubahan yang kamu inginkan...";

	const renderComposer = (minRows = 1, className = "") => (
		<CodebaseChatWorkspaceComposer
			draft={draft}
			onDraftChange={setDraft}
			onSend={handleSend}
			isSending={isSending || isRunWorking}
			minRows={minRows}
			className={className}
			placeholder={composerPlaceholder}
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
					starterSuggestions={isCreatingNew ? undefined : starterSuggestions}
					starterRefresh={isCreatingNew ? undefined : starterRefresh}
					newerAttemptFailure={newerAttemptFailure}
					onRefreshStarterSuggestions={onRefreshStarterSuggestions}
					onPrefillDraft={handlePrefillDraft}
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
								editingQuestionId={answersReadOnly ? null : editingQuestionId}
								readOnly={answersReadOnly}
								onEditQuestion={handleEditQuestion}
								onCancelEdit={handleCancelEditQuestion}
								onSubmit={handleSubmitAnswer}
							/>
							<CodebaseChatWorkspaceArtifactStream
								artifacts={artifacts}
								activeArtifactId={activeArtifactId}
								stage={stage}
								onOpenArtifact={onOpenArtifact}
								onDownloadArtifact={onDownloadArtifact}
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
							{handoffPrompt && exportCmd ? (
								<CodebaseChatWorkspaceHandoffCard
									exportCmd={exportCmd}
									taskCount={kanbanProgress?.total}
									onOpenKanban={
										tasksArtifact && onOpenArtifact
											? () => onOpenArtifact(tasksArtifact)
											: undefined
									}
									handoffPrompt={handoffPrompt}
									codebaseName={codebaseName}
									copiedCmd={copiedCmd}
									copiedExport={copiedExport}
									onCopyCmd={handleCopyCmd}
									onCopyExport={() =>
										handleCopy(exportCmd, (value) => setCopiedExport(value))
									}
								/>
							) : null}
						</div>
					</div>
					{composerAvailable ? (
						<div className="shrink-0 bg-transparent px-4 pb-4 pt-2">
							<div className="mx-auto w-full max-w-3xl">
								{renderComposer(2, "p-3 sm:p-3.5")}
							</div>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}
