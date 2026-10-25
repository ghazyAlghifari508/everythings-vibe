import type { ReactNode } from "react";
import type { CodebaseStarterSuggestion } from "@/features/codebase/services/analysis";
import type {
	AdaptiveQuestion,
	CodebasePipelineStage,
	CodebaseRunState,
} from "@/features/codebase/services/chat-flow";
import type { CodebaseComposerMode } from "@/features/codebase/services/revision-intent";
import type { WorkspaceView } from "@/features/codebase/services/workspace-hydration";
import type { CodebaseArtifactRef } from "../explorer/codebase-file-card";
import type { ChatStreamMessage } from "./codebase-chat-workspace-messages";
import type { CodebaseStarterRefreshState } from "./codebase-chat-workspace-pristine";

export interface CodebaseChatWorkspaceProps {
	featureName: string;
	isCreatingNew?: boolean;
	/**
	 * What the workspace is allowed to show. Supplied by the route from the
	 * resolved plan plus the real per-artifact hydration statuses, so a pending
	 * or failed read can never render as an empty repository. Omitted by callers
	 * that only render the workspace body, which then derives it from the props
	 * below.
	 */
	view?: WorkspaceView;
	/** Plan switcher, rendered in the header when the repository has several plans. */
	planSwitcher?: ReactNode;
	contextFiles?: string[];
	fileCount?: number;
	kanbanProgress?: { done: number; total: number; pct: number } | null;
	messages: ChatStreamMessage[];
	questions: AdaptiveQuestion[];
	answers: Record<string, string>;
	/**
	 * The single in-flight or settled AI request for this workspace, with the
	 * wall-clock start, the real settle time, and the model's own streamed
	 * reasoning. One run renders one ThoughtLine — the question stage and the
	 * Feature/PRD/AC/Task stages share it instead of stacking indicators.
	 */
	run?: CodebaseRunState | null;
	artifacts?: CodebaseArtifactRef[];
	activeArtifactId?: string | null;
	projectIdForHandoff?: string | null;
	stage?: CodebasePipelineStage;
	stageBusy?: CodebasePipelineStage | null;
	stageError?: string | null;
	/**
	 * True while the task read has not settled, so the workspace cannot yet
	 * prove whether tasks already exist. The Task CTA stays hidden until the
	 * read says tasks are genuinely absent, because offering "Buat Task" before
	 * that would invite regenerating work that is already in the database.
	 */
	tasksUnresolved?: boolean;
	answersReadOnly?: boolean;
	composerAvailable?: boolean;
	codebaseName?: string;
	starterSuggestions?: CodebaseStarterSuggestion[];
	starterRefresh?: CodebaseStarterRefreshState;
	/**
	 * A newer analysis attempt for the same snapshot failed while the starter
	 * cards still come from an earlier ready analysis. Shown so the failure is
	 * not hidden by the cards.
	 */
	newerAttemptFailure?: { errorMessage: string | null } | null;
	isSending?: boolean;
	isConfirming?: boolean;
	specError?: string | null;
	onOpenArtifact?: (artifact: CodebaseArtifactRef) => void;
	onDownloadArtifact?: (artifact: CodebaseArtifactRef) => void;
	onSubmitAnswer?: (questionId: string, answer: string) => void;
	onSendMessage?:
		| ((message: string) => void)
		| ((message: string) => boolean | Promise<boolean>);
	/**
	 * What the next message means. The route derives it from the workspace
	 * state: a message in a user-facing plan revises or clarifies that plan,
	 * and only the explicit "Buat fitur baru" action starts a new one. The
	 * composer never asks the user to choose.
	 */
	composerMode?: CodebaseComposerMode;
	/**
	 * The snapshot the existing planning was generated against, and the newest
	 * usable snapshot. A difference means the repository moved on after the plan
	 * was written, which is reported as "review this plan" — nothing is ever
	 * regenerated automatically.
	 */
	planningSnapshotId?: string | null;
	currentSnapshotId?: string | null;
	onReviewPlan?: () => void;
	onConfirmGenerate?: () => void;
	onRetryQuestions?: () => void;
	onRetryGenerate?: () => void;
	onRetryStage?: () => void;
	onGeneratePrd?: () => void;
	onGenerateAc?: () => void;
	onGenerateTask?: () => void;
	onRefreshStarterSuggestions?: (
		analysisId: string,
		snapshotId: string,
	) => void;
}
