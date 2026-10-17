"use client";

import type { CodebasePipelineStage } from "@/features/codebase/services/chat-flow";
import type { CodebaseArtifactRef } from "../explorer/codebase-file-card";
import { CodebaseStageHandoff } from "../workspace/codebase-stage-handoff";

interface CodebaseChatWorkspaceStageHandoffsProps {
	stage: CodebasePipelineStage;
	stageBusy: CodebasePipelineStage | null;
	/**
	 * True while the task read has not settled, so the workspace cannot yet
	 * prove whether tasks already exist. The Task CTA stays hidden until the
	 * read says tasks are genuinely absent, because offering "Buat Task" before
	 * that would invite regenerating work that is already in the database.
	 */
	tasksUnresolved: boolean;
	artifacts: CodebaseArtifactRef[];
	onGeneratePrd?: () => void;
	onGenerateAc?: () => void;
	onGenerateTask?: () => void;
	onOpenArtifact?: (artifact: CodebaseArtifactRef) => void;
	onDownloadArtifact?: (artifact: CodebaseArtifactRef) => void;
}

export function CodebaseChatWorkspaceStageHandoffs({
	stage,
	stageBusy,
	tasksUnresolved,
	artifacts,
	onGeneratePrd,
	onGenerateAc,
	onGenerateTask,
	onOpenArtifact,
	onDownloadArtifact,
}: CodebaseChatWorkspaceStageHandoffsProps) {
	return (
		<>
			{stage === "feature" && onGeneratePrd ? (
				<CodebaseStageHandoff
					testId="codebase-stage-prd"
					outcome={{
						title: "Spesifikasi fitur siap",
						artifact:
							artifacts.find((item) => item.id.startsWith("feature-")) ?? null,
					}}
					nextLabel="PRD"
					nextDescription="Menyusun PRD 8 seksi dari spesifikasi fitur dan konteks repository."
					actionLabel="Buat PRD"
					busyLabel="Menyusun PRD..."
					busy={stageBusy === "prd"}
					onAction={onGeneratePrd}
					onOpenArtifact={onOpenArtifact}
					onDownloadArtifact={onDownloadArtifact}
				/>
			) : null}
			{stage === "prd" && onGenerateAc ? (
				<CodebaseStageHandoff
					testId="codebase-stage-ac"
					outcome={{
						title: "PRD selesai",
						artifact:
							artifacts.find((item) => item.id.startsWith("prd-")) ?? null,
					}}
					nextLabel="Acceptance Criteria"
					nextDescription="Menyusun Acceptance Criteria dari PRD dan konteks repository."
					actionLabel="Buat AC"
					busyLabel="Menyusun AC..."
					busy={stageBusy === "ac"}
					onAction={onGenerateAc}
					onOpenArtifact={onOpenArtifact}
					onDownloadArtifact={onDownloadArtifact}
				/>
			) : null}
			{stage === "ac" && onGenerateTask && !tasksUnresolved ? (
				<CodebaseStageHandoff
					testId="codebase-stage-task"
					outcome={{
						title: "Acceptance Criteria selesai",
						artifact:
							artifacts.find((item) => item.id.startsWith("ac-")) ?? null,
					}}
					nextLabel="Task dan Kanban"
					nextDescription="Menyusun breakdown task dari PRD dan Acceptance Criteria, lalu mengaktifkan papan Kanban."
					actionLabel="Buat Task"
					busyLabel="Menyusun task..."
					busy={stageBusy === "task"}
					onAction={onGenerateTask}
					onOpenArtifact={onOpenArtifact}
					onDownloadArtifact={onDownloadArtifact}
				/>
			) : null}
		</>
	);
}
