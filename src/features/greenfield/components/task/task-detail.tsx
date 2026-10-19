"use client";

import {
	Alert02Icon,
	ArrowRight01Icon,
	File01Icon,
} from "@hugeicons/core-free-icons";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import type { ProjectFeatureTree } from "@/db/schema";
import { CreditExhaustedModal } from "@/features/billing/components/credit-exhausted-modal";
import { DocumentReviewModal } from "@/features/greenfield/components/documents/document-review-modal";
import { ProjectDocumentsDrawer } from "@/features/greenfield/components/documents/project-documents-drawer";
import { WhiteboardCanvas } from "@/features/greenfield/components/whiteboard/whiteboard-canvas";
import { useTaskGeneration } from "@/features/greenfield/hooks/use-task-generation";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import { cn } from "@/lib/utils";
import { useChatStore, useUIStore } from "@/store";
import { ImplementationOptions } from "./implementation-options";
import { TaskMobileTree } from "./task-mobile-tree";
import { IDLE_GENERATING_TITLE, thinkingTitleText } from "./thinking-title";

interface TaskDetailProps {
	projectId: string;
	projectName: string;
	taskTree: TaskTree | null;
	featureTree: ProjectFeatureTree | null;
	hasAc: boolean;
	taskStatus?: string | null;
	latestPrdContent?: string | null;
	latestAcContent?: string | null;
}

// ponytail: honest status per no-hardcode.md Rule 7 â€” while generating, the
// topbar title shows the model's REAL streamed reasoning (SSE `thinking`
// events) via thinkingTitleText; one neutral static label (IDLE_GENERATING_TITLE)
// is the fallback while nothing has streamed. The board shows the skeleton.

/**
 * Task detail container - orchestrates generate flow, canvas, mobile fallback.
 */
export function TaskDetail({
	projectId,
	projectName,
	taskTree,
	featureTree,
	hasAc,
	taskStatus,
	latestPrdContent,
	latestAcContent,
}: TaskDetailProps) {
	const isProjectDrawerOpen = useUIStore((s) => s.isProjectDrawerOpen);
	const setProjectDrawerOpen = useUIStore((s) => s.setProjectDrawerOpen);
	const activeReviewModal = useUIStore((s) => s.activeReviewModal);
	const setActiveReviewModal = useUIStore((s) => s.setActiveReviewModal);
	const navigate = useNavigate();
	const setTaskGenerated = useChatStore((s) => s.setTaskGenerated);
	const creditsExhausted = useChatStore((s) => s.creditsExhausted);
	const setCreditsExhausted = useChatStore((s) => s.setCreditsExhausted);
	const searchStr = useLocation({ select: (l) => l.searchStr });

	// Sync store flag from server-loaded status on mount/project switch, avoids
	// stale true/false leaking across different projects' Task pages.
	// biome-ignore lint/correctness/useExhaustiveDependencies: projectId triggers re-sync on project switch
	useEffect(() => {
		setTaskGenerated(taskStatus === "completed");
	}, [projectId, taskStatus, setTaskGenerated]);

	const {
		generatedTaskTree,
		handleGenerate,
		hasError,
		isGenerating,
		revealCount,
		thinkingText,
	} = useTaskGeneration({
		projectId,
		hasAc,
		taskTree,
		taskStatus,
		searchStr,
		navigate,
	});

	// No AC state
	if (!hasAc) {
		return (
			<div className="flex h-full items-center justify-center bg-onyx text-snow">
				<div className="text-center">
					<Icon icon={File01Icon} size={64} className="mx-auto mb-4 text-fog" />
					<h2 className="mb-2 text-xl font-[510]">AC Belum Tersedia</h2>
					<p className="mb-6 text-fog">
						Generate Acceptance Criteria terlebih dahulu.
					</p>
					<Link
						to="/ac/$id"
						params={{ id: projectId }}
						className="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2"
					>
						<Icon icon={ArrowRight01Icon} size={16} />
						Ke AC
					</Link>
				</div>
			</div>
		);
	}

	const currentTaskTree = generatedTaskTree ?? taskTree;
	const visibleTaskTree =
		currentTaskTree && revealCount !== null
			? { features: currentTaskTree.features.slice(0, revealCount) }
			: currentTaskTree;
	const hasContent = Boolean(
		visibleTaskTree && visibleTaskTree.features.length > 0,
	);
	// Missing status means freshly generated (AI JSON carries no status): read as pending.
	const hasUnfinishedProgress = Boolean(
		taskTree?.features.some((feature) =>
			feature.tasks.some((task) => (task.status ?? "pending") !== "pending"),
		),
	);

	// Title: the model's real streamed reasoning while generating (tail of the
	// latest line), neutral static label before any thinking arrives, project
	// name when done.
	const generatingTitle = thinkingText
		? thinkingTitleText(thinkingText)
		: IDLE_GENERATING_TITLE;
	const displayTitle = isGenerating ? generatingTitle : projectName;

	return (
		<>
			<div className="flex h-full flex-col bg-onyx text-snow">
				{/* Topbar */}
				<div className="flex items-center justify-between border-b border-graphite bg-obsidian px-4 py-3">
					<h1
						className={cn(
							"truncate font-inter text-lg font-[510]",
							isGenerating && "text-fog",
						)}
					>
						{displayTitle}
						{isGenerating && (
							<span aria-hidden="true">
								<span className="animate-pulse">.</span>
								<span className="animate-pulse animate-delay-200">.</span>
								<span className="animate-pulse animate-delay-400">.</span>
							</span>
						)}
					</h1>
					<div className="flex items-center gap-3">
						<Link
							to="/kanban/$id"
							params={{ id: projectId }}
							className="btn-primary px-3 py-1.5 rounded-md text-xs font-[510]"
						>
							Task
						</Link>
						<ImplementationOptions
							projectId={projectId}
							projectName={projectName}
							hasContent={hasContent}
							hasUnfinishedProgress={hasUnfinishedProgress}
						/>
					</div>
				</div>

				{/* Canvas / generate */}
				{/* ponytail: no opaque overlay while generating â€” the board's
				    skeleton diagram stays visible; progress lives in the
				    topbar title (rotating phrases), distinct from PRD/AC. */}
				<div className="relative flex-1 overflow-hidden">
					{/* Mobile: stacked accordion <md */}
					{visibleTaskTree && hasContent && (
						<TaskMobileTree taskTree={visibleTaskTree} />
					)}

					{/* Desktop: interactive canvas >md */}
					<div className={cn("h-full", hasContent && "hidden md:block")}>
						{hasError && !isGenerating && !hasContent ? (
							<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
								<Icon icon={Alert02Icon} size={40} className="text-crimson" />
								<p className="text-fog">Gagal generate task tree.</p>
								<button
									type="button"
									onClick={() => handleGenerate()}
									className="btn-primary rounded-md px-4 py-2 text-sm"
								>
									Coba Lagi
								</button>
							</div>
						) : (
							<WhiteboardCanvas
								projectName={projectName}
								taskTree={visibleTaskTree}
								featureTree={featureTree}
							/>
						)}
					</div>
				</div>
			</div>
			<CreditExhaustedModal
				isOpen={creditsExhausted?.stage === "task"}
				onClose={() => setCreditsExhausted(null)}
				errorMessage={creditsExhausted?.message || ""}
				projectId={projectId}
				stage="task"
			/>

			{/* Project Resources Drawer & Document Review Modal */}
			<ProjectDocumentsDrawer
				isOpen={isProjectDrawerOpen}
				onClose={() => setProjectDrawerOpen(false)}
				projectName={projectName}
				hasPrd={Boolean(latestPrdContent)}
				hasAc={Boolean(hasAc || latestAcContent)}
				onSelectDocument={(docType) => {
					setProjectDrawerOpen(false);
					setActiveReviewModal(docType);
				}}
			/>

			<DocumentReviewModal
				isOpen={activeReviewModal !== null}
				onClose={() => setActiveReviewModal(null)}
				type={activeReviewModal}
				projectName={projectName}
				content={
					activeReviewModal === "prd"
						? (latestPrdContent ?? null)
						: (latestAcContent ?? null)
				}
			/>
		</>
	);
}
