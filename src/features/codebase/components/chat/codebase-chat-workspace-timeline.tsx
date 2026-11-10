import { useState } from "react";
import type { useWorkspaceChatControls } from "../../hooks/use-workspace-chat-controls";
import { restoreAskState } from "../../services/chat-flow";
import { buildWorkspaceTimeline } from "../../services/workspace-timeline-presentation";
import type { WorkspaceEvent } from "../../types/workspace-timeline";
import {
	CodebaseChatWorkspaceSpecError,
	CodebaseChatWorkspaceStageError,
} from "./codebase-chat-workspace-error-rows";
import { CodebaseChatWorkspaceHandoffCard } from "./codebase-chat-workspace-handoff";
import { CodebaseChatWorkspaceMessages } from "./codebase-chat-workspace-messages";
import type { CodebaseChatWorkspaceProps } from "./codebase-chat-workspace-props";
import { CodebaseChatWorkspaceQuestions } from "./codebase-chat-workspace-questions";
import { CodebaseChatWorkspacePendingRevisionBanner } from "./codebase-chat-workspace-revision-controls";
import { CodebasePlanningStageCard } from "./codebase-planning-stage-card";

const STAGES = {
	questions: "Pertanyaan klarifikasi",
	feature: "Spesifikasi fitur",
	prd: "PRD",
	ac: "Acceptance Criteria",
	task: "Task",
	handoff: "Handoff",
};
export function CodebaseChatWorkspaceTimeline({
	controls,
	...props
}: CodebaseChatWorkspaceProps & {
	controls: ReturnType<typeof useWorkspaceChatControls>;
}) {
	const {
		timelineEvents,
		messages,
		questions,
		answers,
		artifacts = [],
		activeArtifactId = null,
		run = null,
		stage = "questions",
		stageBusy = null,
		tasksUnresolved = false,
		answersReadOnly = stage !== "questions",
		answersPersistence,
		isConfirming = false,
		specError,
		stageError,
		pendingProposal,
		kanbanProgress,
		codebaseName,
		onRetryQuestions,
		onRetryStage,
		onRetryGenerate,
		onConfirmGenerate,
		onGeneratePrd,
		onGenerateAc,
		onGenerateTask,
		onOpenArtifact,
		onDownloadArtifact,
		onOpenReview,
	} = props;
	const tasksArtifact = artifacts.find((item) => item.id.startsWith("tasks-"));
	const activeSpecError =
		(run?.stage === "feature" && run.status === "failed" ? run.error : null) ??
		specError;
	const entries = buildWorkspaceTimeline({
		events:
			timelineEvents ??
			messages.map(
				(message, index): WorkspaceEvent => ({
					id: message.id,
					codebaseId: props.codebaseId ?? "",
					projectId: props.projectId ?? "",
					type: message.role === "user" ? "user_message" : "assistant_message",
					content: message.content,
					stage:
						message.stage ?? (message.role === "user" ? "questions" : "prd"),
					status: "completed",
					createdAt: message.createdAt ?? new Date(index).toISOString(),
					updatedAt: message.createdAt ?? new Date(index).toISOString(),
				}),
			),
		artifacts,
		hasQuestions: questions.length > 0,
		hasHandoff: Boolean(controls.handoffPrompt && controls.exportCmd),
		run,
	});
	const latestQuestionsId = entries
		.filter((entry) => entry.kind === "questions")
		.at(-1)?.id;
	const [handoffRevealed, setHandoffRevealed] = useState(false);
	const isHandoffActive =
		handoffRevealed ||
		stage === "handoff" ||
		Boolean(props.projectIdForHandoff);
	const shouldShowPlanningCard = stage !== "questions" || artifacts.length > 0;
	let hasRenderedPlanningCard = false;

	const planningStageCard = shouldShowPlanningCard ? (
		<CodebasePlanningStageCard
			featureName={props.featureName}
			stage={stage}
			stageBusy={stageBusy}
			stageError={run?.status !== "failed" ? stageError : null}
			tasksUnresolved={tasksUnresolved}
			artifacts={artifacts}
			activeArtifactId={activeArtifactId}
			taskCount={kanbanProgress?.total}
			onGeneratePrd={onGeneratePrd}
			onGenerateAc={onGenerateAc}
			onGenerateTask={onGenerateTask}
			onTriggerHandoff={() => setHandoffRevealed(true)}
			onStartRevision={controls.handleStartRevision}
			onOpenArtifact={onOpenArtifact}
			onDownloadArtifact={onDownloadArtifact}
			onRetryStage={onRetryStage}
		/>
	) : null;
	const hasProposalEvent = entries.some(
		(entry) =>
			entry.kind === "revision" &&
			entry.event.proposalId === pendingProposal?.id,
	);
	return (
		<section
			className="mx-auto flex w-full max-w-3xl flex-col gap-5"
			aria-label="Riwayat planning"
		>
			{entries.map((entry) => (
				<section
					key={entry.id}
					data-workspace-event={entry.id}
					data-workspace-stage={entry.stage}
				>
					{entry.kind === "message" ? (
						<CodebaseChatWorkspaceMessages
							messages={[
								{ id: entry.id, role: entry.role, content: entry.content },
							]}
							run={null}
						/>
					) : null}
					{entry.kind === "questions" && entry.id === latestQuestionsId ? (
						<CodebaseChatWorkspaceQuestions
							questions={questions}
							answers={answers}
							readOnly={answersReadOnly}
							showFinalAction={stage === "questions" && !activeSpecError}
							isConfirming={isConfirming}
							persistence={answersPersistence}
							onConfirmGenerate={onConfirmGenerate}
							onSubmit={controls.handleSubmitAnswer}
						/>
					) : null}
					{entry.kind === "questions" &&
					entry.id !== latestQuestionsId &&
					entry.event?.questions ? (
						<CodebaseChatWorkspaceQuestions
							questions={restoreAskState(entry.event.questions, []).questions}
							answers={entry.event.answers ?? {}}
							readOnly
							onSubmit={controls.handleSubmitAnswer}
						/>
					) : null}
					{entry.kind === "artifact"
						? !hasRenderedPlanningCard
							? (() => {
									hasRenderedPlanningCard = true;
									return planningStageCard;
								})()
							: null
						: null}
					{entry.kind === "operation" ? (
						entry.run ? (
							<CodebaseChatWorkspaceMessages
								messages={[]}
								run={entry.run}
								onRetryQuestions={onRetryQuestions}
								onRetryStage={onRetryStage}
								onRetryGenerate={onRetryGenerate}
							/>
						) : (
							<output className="text-sm text-fog">
								{STAGES[entry.stage]}:{" "}
								{entry.event?.status === "failed"
									? "gagal"
									: entry.event?.status === "cancelled"
										? "dibatalkan"
										: "sedang diproses"}
							</output>
						)
					) : null}
					{entry.kind === "revision" ? (
						<>
							<p className="text-sm text-fog">
								{STAGES[entry.stage]}:{" "}
								{entry.event.type === "revision_completed"
									? "revisi diterapkan"
									: entry.event.type === "revision_rejected"
										? "revisi ditolak"
										: "proposal revisi tersimpan"}
							</p>
							{entry.event.type === "revision_proposed" &&
							entry.event.proposalId === pendingProposal?.id ? (
								<CodebaseChatWorkspacePendingRevisionBanner
									proposal={pendingProposal}
									onOpenReview={onOpenReview}
								/>
							) : null}
						</>
					) : null}
					{entry.kind === "handoff" &&
					isHandoffActive &&
					controls.handoffPrompt &&
					controls.exportCmd ? (
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
								controls.handleCopy(
									controls.exportCmd ?? "",
									controls.setCopiedExport,
								)
							}
							isRevisingCompletedPlan={controls.isCompletedRevisionOpen}
							onStartCompletedRevision={controls.openCompletedRevision}
							onCancelCompletedRevision={controls.cancelCompletedRevision}
						/>
					) : null}
				</section>
			))}
			{!hasProposalEvent ? (
				<CodebaseChatWorkspacePendingRevisionBanner
					proposal={pendingProposal}
					onOpenReview={onOpenReview}
				/>
			) : null}
			{activeSpecError ? (
				<CodebaseChatWorkspaceSpecError
					message={activeSpecError}
					onRetry={onRetryGenerate}
				/>
			) : null}
			{!shouldShowPlanningCard && stageError && run?.status !== "failed" ? (
				<CodebaseChatWorkspaceStageError
					message={stageError}
					onRetry={onRetryStage}
				/>
			) : null}
			{!hasRenderedPlanningCard ? planningStageCard : null}
			{isHandoffActive &&
			!entries.some((entry) => entry.kind === "handoff") &&
			controls.handoffPrompt &&
			controls.exportCmd ? (
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
						controls.handleCopy(
							controls.exportCmd ?? "",
							controls.setCopiedExport,
						)
					}
					isRevisingCompletedPlan={controls.isCompletedRevisionOpen}
					onStartCompletedRevision={controls.openCompletedRevision}
					onCancelCompletedRevision={controls.cancelCompletedRevision}
				/>
			) : null}
		</section>
	);
}
