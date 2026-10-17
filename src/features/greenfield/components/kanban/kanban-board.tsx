"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentReviewModal } from "@/features/greenfield/components/documents/document-review-modal";
import { ProjectDocumentsDrawer } from "@/features/greenfield/components/documents/project-documents-drawer";
import { useKanbanTasks } from "@/features/greenfield/hooks/use-kanban-polling";
import {
	computeKanbanProgress,
	extractPhases,
	filterColumnsByPhase,
} from "@/lib/kanban-utils";
import { useUIStore } from "@/store";
import {
	KanbanBoardError,
	KanbanBoardSkeleton,
	KanbanEmptyPhase,
	KanbanEmptyState,
	KanbanGeneratingSkeleton,
} from "./kanban-board-states";
import { KanbanColumn, type KanbanColumnHandle } from "./kanban-column";
import { KanbanAcChangedBanner, KanbanHeader } from "./kanban-header";
import { KanbanResetDialog } from "./kanban-reset-dialog";
import { KanbanToolbar } from "./kanban-toolbar";

// Whether a progress reset would change anything. Mirrors the server's
// `needsProgressReset` for the UI's disabled state: a board with everything
// still pending has no work to clear, so the action is hidden rather than
// offering a no-op button.
export function canResetProgress(
	columns: Record<string, Array<{ id: string }>> | null,
): boolean {
	if (!columns) return false;
	const nonPending = ["in_progress", "completed", "failed"] as const;
	return nonPending.some((status) => (columns[status]?.length ?? 0) > 0);
}

interface KanbanBoardProps {
	projectId: string;
	projectName: string;
	latestPrdContent?: string | null;
	latestAcContent?: string | null;
	navigationContext?: {
		codebaseId: string;
		codebaseName: string;
	};
}

export function KanbanBoard({
	projectId,
	projectName,
	latestPrdContent,
	latestAcContent,
	navigationContext,
}: KanbanBoardProps) {
	const isProjectDrawerOpen = useUIStore((s) => s.isProjectDrawerOpen);
	const setProjectDrawerOpen = useUIStore((s) => s.setProjectDrawerOpen);
	const showToast = useUIStore((s) => s.showToast);
	const [activeReviewModal, setActiveReviewModal] = useState<
		"prd" | "ac" | null
	>(null);
	const [resetDialogOpen, setResetDialogOpen] = useState(false);
	const [isResetting, setIsResetting] = useState(false);

	const { data, isLoading, isError, staleness, refetch } = useKanbanTasks({
		projectId,
		intervalMs: 10000,
	});

	const columns = data?.columns;
	const lastUpdateAt = data?.lastUpdateAt;

	// Extract phases dynamically from actual tasks
	const phases = useMemo(
		() => (columns ? extractPhases(columns) : []),
		[columns],
	);

	// Phase filter state (presentation state)
	const [selectedPhase, setSelectedPhase] = useState<string | null>(null);

	// Find active phase if selected, fallback cleanly if invalidated
	const activePhase = useMemo(
		() =>
			selectedPhase
				? (phases.find((p) => p.id === selectedPhase) ?? null)
				: null,
		[phases, selectedPhase],
	);

	// Filtered columns based on selected phase
	const visibleColumns = useMemo(
		() => (columns ? filterColumnsByPhase(columns, selectedPhase) : null),
		[columns, selectedPhase],
	);

	// Progress derived from visible scope
	const progress = useMemo(
		() =>
			visibleColumns
				? computeKanbanProgress(visibleColumns)
				: { total: 0, done: 0, pct: 0 },
		[visibleColumns],
	);
	const projectProgress = useMemo(
		() =>
			columns ? computeKanbanProgress(columns) : { total: 0, done: 0, pct: 0 },
		[columns],
	);

	const hasProjectTasks = useMemo(() => {
		if (!columns) return false;
		return (
			columns.pending.length +
				columns.in_progress.length +
				columns.completed.length +
				columns.failed.length >
			0
		);
	}, [columns]);

	const hasVisibleTasks = useMemo(() => {
		if (!visibleColumns) return false;
		return (
			visibleColumns.pending.length +
				visibleColumns.in_progress.length +
				visibleColumns.completed.length +
				visibleColumns.failed.length >
			0
		);
	}, [visibleColumns]);

	const selectedPhaseLabel = activePhase ? activePhase.label : "Semua";

	// Track card movements for animation
	const prevColumnsRef = useRef<typeof columns | null>(null);
	const [highlightedCardId, setHighlightedCardId] = useState<string | null>(
		null,
	);
	const [dismissedBanners, setDismissedBanners] = useState<string[]>([]);
	const columnRefsRef = useRef<Record<string, KanbanColumnHandle | null>>({});

	const hasUpdates =
		columns &&
		(columns.in_progress.length > 0 ||
			columns.completed.length > 0 ||
			columns.failed.length > 0);

	// Detect card movements between columns and trigger animation
	useEffect(() => {
		if (!prevColumnsRef.current || !columns) {
			prevColumnsRef.current = columns;
			return;
		}

		const prev = prevColumnsRef.current;
		const curr = columns;
		const statuses = ["pending", "in_progress", "completed", "failed"] as const;

		for (const status of statuses) {
			const prevIds = new Set((prev[status] || []).map((c) => c.id));
			const currIds = new Set((curr[status] || []).map((c) => c.id));

			// Find newly added cards to this column
			for (const id of currIds) {
				if (!prevIds.has(id)) {
					// Card moved TO this column
					setHighlightedCardId(id);
					// Auto-scroll to the column containing this card
					setTimeout(() => {
						const colRef = columnRefsRef.current[status];
						colRef?.scrollIntoView();
					}, 100);
					break;
				}
			}
		}
		prevColumnsRef.current = columns;
	}, [columns]);

	// Clear highlight after animation
	useEffect(() => {
		if (highlightedCardId) {
			const timer = setTimeout(() => setHighlightedCardId(null), 2000);
			return () => clearTimeout(timer);
		}
	}, [highlightedCardId]);

	// AC changed comes from API response (compares ac_versions.created_at vs tasks.created_at)
	const acChanged = data?.acChanged || false;

	// Pull-to-refresh for mobile: one refresh per gesture so a single
	// downward swipe cannot fan out into overlapping requests.
	const [touchStart, setTouchStart] = useState(0);
	const pullFired = useRef(false);
	const handleTouchStart = (e: React.TouchEvent) => {
		pullFired.current = false;
		setTouchStart(e.touches[0].clientY);
	};
	const handleTouchMove = (e: React.TouchEvent) => {
		if (!pullFired.current && touchStart - e.touches[0].clientY < -100) {
			pullFired.current = true;
			refetch();
		}
	};

	const handleResetProgress = async () => {
		setIsResetting(true);
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/reset-progress`,
				{ method: "POST" },
			);
			const json = (await res.json().catch(() => null)) as unknown;
			if (!res.ok) {
				const message =
					json && typeof json === "object" && "error" in json
						? String((json as { error: unknown }).error)
						: "Gagal mereset progress.";
				showToast(message, "error");
				return;
			}
			const tasksReset =
				json && typeof json === "object" && "tasksReset" in json
					? Number((json as { tasksReset: unknown }).tasksReset)
					: 0;
			showToast(
				tasksReset > 0
					? `${tasksReset} task dikembalikan ke pending.`
					: "Tidak ada progress yang perlu direset.",
				"success",
			);
			setResetDialogOpen(false);
			refetch();
		} catch {
			showToast("Gagal menghubungi server.", "error");
		} finally {
			setIsResetting(false);
		}
	};

	if (isLoading && !data) {
		return <KanbanBoardSkeleton />;
	}

	if (isError && !data) {
		return <KanbanBoardError onRetry={refetch} />;
	}

	return (
		<div
			className="flex h-dvh flex-col bg-onyx text-snow overflow-hidden"
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
		>
			{/* Kanban Header / Navigation bar */}
			<KanbanHeader
				projectId={projectId}
				projectName={projectName}
				navigationContext={navigationContext}
				projectProgress={projectProgress}
				lastUpdateAt={lastUpdateAt}
				staleness={staleness}
				isLoading={isLoading}
				hasUpdates={Boolean(hasUpdates)}
				canReset={canResetProgress(columns ?? null)}
				isResetting={isResetting}
				onRefetch={refetch}
				onOpenResetDialog={() => setResetDialogOpen(true)}
			/>

			{/* AC Changed Banner (Only shown if AC was updated after tasks generated) */}
			{!dismissedBanners.includes("ac-changed") && acChanged && (
				<KanbanAcChangedBanner
					onDismiss={() =>
						setDismissedBanners((prev) => [...prev, "ac-changed"])
					}
				/>
			)}

			{/* Centered Main Content Container */}
			<main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col min-h-0 overflow-hidden px-4 sm:px-6 lg:px-8">
				{/* Toolbar: Phase Filter & Progress Bar */}
				{hasProjectTasks && (
					<KanbanToolbar
						phases={phases}
						selectedPhase={selectedPhase}
						selectedPhaseLabel={selectedPhaseLabel}
						progress={progress}
						onSelectPhase={setSelectedPhase}
					/>
				)}

				{/* Main Column Layout Area */}
				<section
					className="flex-1 overflow-x-auto overflow-y-hidden select-none custom-scrollbar snap-x snap-mandatory sm:snap-none pt-2 pb-6 min-h-0"
					aria-label="Kanban columns"
				>
					{!hasProjectTasks && data?.taskStatus === "generating" ? (
						// Tasks are being generated by AI — show skeleton columns
						<KanbanGeneratingSkeleton />
					) : !hasProjectTasks ? (
						<KanbanEmptyState />
					) : !hasVisibleTasks ? (
						<KanbanEmptyPhase
							phaseLabel={selectedPhaseLabel}
							onShowAll={() => setSelectedPhase(null)}
						/>
					) : (
						<div className="flex h-full min-w-full gap-4">
							<KanbanColumn
								ref={(el) => {
									columnRefsRef.current.pending = el;
								}}
								title="Belum Mulai"
								count={visibleColumns?.pending.length || 0}
								cards={visibleColumns?.pending || []}
								highlightedCardId={highlightedCardId}
							/>
							<KanbanColumn
								ref={(el) => {
									columnRefsRef.current.in_progress = el;
								}}
								title="Dikerjakan"
								count={visibleColumns?.in_progress.length || 0}
								cards={visibleColumns?.in_progress || []}
								highlightedCardId={highlightedCardId}
							/>
							<KanbanColumn
								ref={(el) => {
									columnRefsRef.current.completed = el;
								}}
								title="Selesai"
								count={visibleColumns?.completed.length || 0}
								cards={visibleColumns?.completed || []}
								highlightedCardId={highlightedCardId}
							/>
							<KanbanColumn
								ref={(el) => {
									columnRefsRef.current.failed = el;
								}}
								title="Gagal"
								count={visibleColumns?.failed.length || 0}
								cards={visibleColumns?.failed || []}
								highlightedCardId={highlightedCardId}
							/>
						</div>
					)}
				</section>
			</main>

			{/* Project Resources Drawer & Document Review Modal (matches Task page behavior) */}
			<ProjectDocumentsDrawer
				isOpen={isProjectDrawerOpen}
				onClose={() => setProjectDrawerOpen(false)}
				projectName={projectName}
				hasPrd={Boolean(latestPrdContent)}
				hasAc={Boolean(latestAcContent)}
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

			<KanbanResetDialog
				open={resetDialogOpen}
				isResetting={isResetting}
				onOpenChange={setResetDialogOpen}
				onConfirm={() => void handleResetProgress()}
			/>
		</div>
	);
}
