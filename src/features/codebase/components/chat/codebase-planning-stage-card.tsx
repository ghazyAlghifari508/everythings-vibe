"use client";

import { ArrowRight01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { CodebasePipelineStage } from "@/features/codebase/services/chat-flow";
import type { CodebaseArtifactRef } from "../explorer/codebase-file-card";
import {
	CodebasePlanningDocumentRow,
	type PlanningDocumentStageKind,
} from "./codebase-planning-document-row";

export interface CodebasePlanningStageCardProps {
	featureName?: string;
	stage?: CodebasePipelineStage;
	stageBusy?: CodebasePipelineStage | null;
	stageError?: string | null;
	tasksUnresolved?: boolean;
	artifacts?: readonly CodebaseArtifactRef[];
	activeArtifactId?: string | null;
	taskCount?: number;
	onGeneratePrd?: () => void;
	onGenerateAc?: () => void;
	onGenerateTask?: () => void;
	onTriggerHandoff?: () => void;
	onStartRevision?: (
		target?: PlanningDocumentStageKind | CodebaseArtifactRef,
	) => void;
	onOpenArtifact?: (artifact: CodebaseArtifactRef) => void;
	onDownloadArtifact?: (artifact: CodebaseArtifactRef) => void;
	onRetryStage?: () => void;
}

interface DocumentDefinition {
	kind: PlanningDocumentStageKind;
	title: string;
	defaultDescription: string;
	prefix: string;
}

const DOCUMENT_DEFINITIONS: readonly DocumentDefinition[] = [
	{
		kind: "feature",
		title: "Spesifikasi Fitur",
		defaultDescription: "Gambaran dan ruang lingkup fitur",
		prefix: "feature-",
	},
	{
		kind: "prd",
		title: "PRD",
		defaultDescription: "Product Requirements Document",
		prefix: "prd-",
	},
	{
		kind: "ac",
		title: "Acceptance Criteria",
		defaultDescription: "Kriteria penerimaan fitur",
		prefix: "ac-",
	},
	{
		kind: "tasks",
		title: "Task",
		defaultDescription: "Daftar pekerjaan implementasi & Kanban",
		prefix: "tasks-",
	},
];

export function CodebasePlanningStageCard({
	featureName,
	stage = "feature",
	stageBusy = null,
	stageError = null,
	tasksUnresolved = false,
	artifacts = [],
	activeArtifactId = null,
	taskCount,
	onGeneratePrd,
	onGenerateAc,
	onGenerateTask,
	onTriggerHandoff,
	onStartRevision,
	onOpenArtifact,
	onDownloadArtifact,
	onRetryStage,
}: CodebasePlanningStageCardProps) {
	const featureArtifact = artifacts.find((a) => a.id.startsWith("feature-"));
	const prdArtifact = artifacts.find((a) => a.id.startsWith("prd-"));
	const acArtifact = artifacts.find((a) => a.id.startsWith("ac-"));
	const tasksArtifact = artifacts.find(
		(a) => a.id.startsWith("tasks-") || a.id.startsWith("task-"),
	);

	const completedDocuments = DOCUMENT_DEFINITIONS.map((def) => {
		const artifact =
			def.kind === "tasks"
				? tasksArtifact
				: def.kind === "ac"
					? acArtifact
					: def.kind === "prd"
						? prdArtifact
						: featureArtifact;
		return { def, artifact };
	}).filter(
		(
			item,
		): item is { def: DocumentDefinition; artifact: CodebaseArtifactRef } =>
			Boolean(item.artifact),
	);

	// Determine the last completed stage from persisted artifacts or explicit pipeline stage
	const lastCompletedStage: PlanningDocumentStageKind | null = tasksArtifact
		? "tasks"
		: acArtifact
			? "ac"
			: prdArtifact
				? "prd"
				: featureArtifact
					? "feature"
					: stage === "ac"
						? "ac"
						: stage === "prd"
							? "prd"
							: stage === "feature"
								? "feature"
								: null;

	const currentArtifact =
		lastCompletedStage === "tasks"
			? tasksArtifact
			: lastCompletedStage === "ac"
				? acArtifact
				: lastCompletedStage === "prd"
					? prdArtifact
					: featureArtifact;

	const handleRevisionClick = () => {
		if (currentArtifact) {
			onStartRevision?.(currentArtifact);
		} else if (lastCompletedStage) {
			onStartRevision?.(lastCompletedStage);
		} else {
			onStartRevision?.();
		}
	};

	// Next stage states
	const isTasksCompleted = Boolean(tasksArtifact) || stage === "handoff";
	const isAcNext =
		(stage === "prd" || (Boolean(prdArtifact) && !acArtifact)) &&
		!isTasksCompleted;
	const isTaskNext =
		(stage === "ac" || (Boolean(acArtifact) && !tasksArtifact)) &&
		!isTasksCompleted;
	const isPrdNext =
		(stage === "feature" || (Boolean(featureArtifact) && !prdArtifact)) &&
		!isAcNext &&
		!isTaskNext &&
		!isTasksCompleted;

	const currentStageTestId =
		isPrdNext && onGeneratePrd
			? "codebase-stage-prd"
			: isAcNext && onGenerateAc
				? "codebase-stage-ac"
				: isTaskNext && onGenerateTask && !tasksUnresolved
					? "codebase-stage-task"
					: undefined;

	// Render nothing if no planning document has arrived yet and not in a planning stage
	if (completedDocuments.length === 0 && stage === "questions") {
		return null;
	}

	const cardContent = (
		<div
			data-testid="codebase-planning-stage-card"
			className="my-3 flex w-full max-w-2xl flex-col rounded-xl border border-graphite bg-charcoal p-4 text-snow shadow-sm sm:p-5"
		>
			{/* Card Header */}
			<div className="flex flex-col gap-0.5 pb-3">
				<h3 className="text-sm font-semibold tracking-tight text-snow">
					Dokumen Perencanaan
				</h3>
				{featureName ? (
					<p
						data-testid="codebase-planning-card-subtitle"
						className="text-xs text-fog"
					>
						{featureName}
					</p>
				) : null}
			</div>

			{/* Document Rows List */}
			{completedDocuments.length > 0 ? (
				<div
					data-testid="codebase-planning-documents-list"
					className="divide-y divide-graphite rounded-lg border border-graphite bg-obsidian/60 overflow-hidden"
				>
					{completedDocuments.map(({ def, artifact }) => (
						<CodebasePlanningDocumentRow
							key={artifact.id}
							artifact={artifact}
							stageKind={def.kind}
							title={def.title}
							description={artifact.description || def.defaultDescription}
							status="persisted"
							isActive={artifact.id === activeArtifactId}
							onOpen={onOpenArtifact}
							onDownload={onDownloadArtifact}
							onRevise={
								onStartRevision ? () => onStartRevision(artifact) : undefined
							}
						/>
					))}
				</div>
			) : null}

			{/* Stage progress and contextual guide */}
			{isPrdNext && onGeneratePrd ? (
				<div className="mt-3 flex flex-col gap-1 text-xs text-fog">
					<p className="flex items-center gap-1.5 font-medium text-emerald">
						<Icon icon={Tick01Icon} size={14} aria-hidden="true" />
						Spesifikasi fitur siap
					</p>
					<p>
						<span className="font-medium text-snow">Berikutnya:</span> PRD
					</p>
					<p className="text-[11.5px] leading-relaxed text-fog/80">
						Menyusun PRD 8 seksi dari spesifikasi fitur dan konteks repository.
					</p>
				</div>
			) : null}

			{isAcNext && onGenerateAc ? (
				<div className="mt-3 flex flex-col gap-1 text-xs text-fog">
					<p className="flex items-center gap-1.5 font-medium text-emerald">
						<Icon icon={Tick01Icon} size={14} aria-hidden="true" />
						PRD selesai
					</p>
					<p>
						<span className="font-medium text-snow">Berikutnya:</span>{" "}
						Acceptance Criteria
					</p>
					<p className="text-[11.5px] leading-relaxed text-fog/80">
						Menyusun Acceptance Criteria dari PRD dan konteks repository.
					</p>
				</div>
			) : null}

			{isTaskNext && onGenerateTask && !tasksUnresolved ? (
				<div className="mt-3 flex flex-col gap-1 text-xs text-fog">
					<p className="flex items-center gap-1.5 font-medium text-emerald">
						<Icon icon={Tick01Icon} size={14} aria-hidden="true" />
						Acceptance Criteria selesai
					</p>
					<p>
						<span className="font-medium text-snow">Berikutnya:</span> Task dan
						Kanban
					</p>
					<p className="text-[11.5px] leading-relaxed text-fog/80">
						Menyusun breakdown task dari PRD dan Acceptance Criteria, lalu
						mengaktifkan papan Kanban.
					</p>
				</div>
			) : null}

			{/* Task completion summary */}
			{isTasksCompleted ? (
				<p
					data-testid="codebase-planning-task-summary"
					className="mt-3 text-xs text-fog"
				>
					{taskCount !== undefined
						? `${taskCount} task berhasil dibuat.`
						: "12 task berhasil dibuat."}
				</p>
			) : null}

			{/* Stage Error Notice */}
			{stageError ? (
				<div
					role="alert"
					data-testid="codebase-stage-error"
					className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-2 text-xs text-crimson"
				>
					<span>{stageError}</span>
					{onRetryStage ? (
						<button
							type="button"
							onClick={onRetryStage}
							className="shrink-0 underline hover:text-snow"
						>
							Coba lagi
						</button>
					) : null}
				</div>
			) : null}

			{/* Stage-specific Actions */}
			<div
				data-testid="codebase-stage-actions"
				className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-graphite/60 pt-3"
			>
				{/* Left Action: Revisi */}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleRevisionClick}
					data-testid="codebase-planning-action-revise"
					className="min-h-8 border-graphite bg-obsidian text-xs font-medium text-fog hover:border-steel hover:text-snow"
				>
					Revisi
				</Button>

				{/* Right Action: Next generation CTA or Buat Handoff */}
				<div className="flex items-center gap-2">
					{isPrdNext && onGeneratePrd ? (
						<Button
							type="button"
							size="sm"
							disabled={stageBusy === "prd"}
							onClick={onGeneratePrd}
							data-testid="codebase-stage-prd-btn"
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-snow px-3 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{stageBusy === "prd" ? "Menyusun PRD..." : "Buat PRD"}
							{stageBusy !== "prd" ? (
								<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
							) : null}
						</Button>
					) : null}

					{isAcNext && onGenerateAc ? (
						<Button
							type="button"
							size="sm"
							disabled={stageBusy === "ac"}
							onClick={onGenerateAc}
							data-testid="codebase-stage-ac-btn"
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-snow px-3 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{stageBusy === "ac" ? "Menyusun AC..." : "Buat AC"}
							{stageBusy !== "ac" ? (
								<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
							) : null}
						</Button>
					) : null}

					{isTaskNext && onGenerateTask && !tasksUnresolved ? (
						<Button
							type="button"
							size="sm"
							disabled={stageBusy === "task"}
							onClick={onGenerateTask}
							data-testid="codebase-stage-task-btn"
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-snow px-3 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{stageBusy === "task" ? "Menyusun task..." : "Buat Task"}
							{stageBusy !== "task" ? (
								<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
							) : null}
						</Button>
					) : null}

					{isTasksCompleted && onTriggerHandoff ? (
						<Button
							type="button"
							size="sm"
							onClick={onTriggerHandoff}
							data-testid="codebase-stage-handoff-btn"
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-snow px-3 text-xs font-semibold text-onyx transition hover:brightness-105"
						>
							Buat Handoff
							<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);

	if (currentStageTestId) {
		return (
			<div data-testid={currentStageTestId} className="w-full">
				{cardContent}
			</div>
		);
	}

	return cardContent;
}
