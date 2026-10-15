"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type TaskCard, useKanbanTasks } from "@/hooks/use-kanban-polling";
import { computeKanbanProgress } from "@/lib/kanban-utils";

interface CodebaseKanbanBoardProps {
	projectId: string | null;
	codebaseId?: string;
	columns?: {
		pending: TaskCard[];
		in_progress: TaskCard[];
		completed: TaskCard[];
		failed: TaskCard[];
	} | null;
	staleness?: "live" | "stale" | "disconnected";
	isLoadingExternal?: boolean;
	isErrorExternal?: boolean;
	onRetryExternal?: () => void;
	/**
	 * Whether the full board route is reachable for this account. The route
	 * itself gates on the plan, so a link is only offered when it will not
	 * bounce the user into an upgrade redirect.
	 */
	canOpenFullBoard?: boolean;
}

interface ColumnSpec {
	key: string;
	title: string;
	cards: TaskCard[];
	highlightInProgress?: boolean;
}

function Column({ title, cards, highlightInProgress }: ColumnSpec) {
	return (
		<section
			data-testid={`codebase-kanban-col-${title}`}
			className="flex min-h-[220px] w-56 shrink-0 flex-col rounded-lg border border-graphite bg-obsidian"
		>
			<div className="flex items-center justify-between border-b border-graphite px-3 py-2">
				<h3 className="text-[11.5px] font-semibold text-mist">{title}</h3>
				<span className="rounded bg-charcoal px-1.5 py-px font-mono text-[10px] text-fog">
					{cards.length}
				</span>
			</div>
			<div className="flex flex-1 flex-col gap-2 p-2.5">
				{cards.length === 0 ? (
					<p className="text-[11px] leading-4 text-slate">Kosong</p>
				) : (
					cards.map((card) => (
						<article
							key={card.id}
							data-testid="codebase-kanban-card"
							className={`flex flex-col gap-1.5 rounded-md border bg-charcoal p-2.5 ${
								highlightInProgress
									? "border-indigo/40 bg-indigo/5"
									: "border-graphite"
							}`}
						>
							<span className="w-fit max-w-full truncate rounded border border-graphite bg-obsidian px-1 py-px font-mono text-[9.5px] uppercase text-fog">
								{card.featureName}
							</span>
							<p className="text-xs font-semibold leading-5 text-snow">
								{card.name}
							</p>
							{highlightInProgress ? (
								<span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-indigo">
									<span
										aria-hidden="true"
										className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo motion-reduce:animate-none"
									/>
									Agent coding...
								</span>
							) : null}
							<span className="font-mono text-[10px] text-fog">
								{typeof card.subtaskCompleted === "number" &&
								typeof card.subtaskCount === "number"
									? `${card.subtaskCompleted}/${card.subtaskCount} subtask`
									: card.status}
							</span>
						</article>
					))
				)}
			</div>
		</section>
	);
}

/**
 * Kanban preview for the workspace's right panel.
 *
 * The panel is narrow (roughly 360-560px), so columns keep a readable card
 * width and the board scrolls horizontally instead of squeezing three columns
 * into the available space. Card titles stay fully visible, and the same
 * statuses, feature grouping, subtask progress, and live signal the full board
 * uses are preserved — the panel is a preview of the real data, never a
 * simplified copy of it.
 */
export function CodebaseKanbanBoard({
	projectId,
	codebaseId,
	columns: columnsProp,
	staleness: stalenessProp,
	isLoadingExternal,
	isErrorExternal,
	onRetryExternal,
	canOpenFullBoard = true,
}: CodebaseKanbanBoardProps) {
	// The board owns its own polling only when the parent supplies no data and
	// no external state. A parent that passes columns or loading/error state
	// already holds the connection, so opening a second one here would double
	// the stream and could show two disagreeing states.
	const ownsData =
		columnsProp === undefined &&
		isLoadingExternal === undefined &&
		isErrorExternal === undefined;
	const hook = useKanbanTasks({
		projectId: projectId ?? "",
		enabled: ownsData && Boolean(projectId),
	});
	const data = ownsData ? hook.data : null;
	const columns = columnsProp ?? data?.columns ?? null;
	const staleness = stalenessProp ?? hook.staleness;
	const isLoading = isLoadingExternal ?? (ownsData ? hook.isLoading : false);
	const isError = isErrorExternal ?? (ownsData ? hook.isError : false);
	const handleRetry = () => {
		if (onRetryExternal) onRetryExternal();
		else if (ownsData) void hook.refetch();
	};

	const progress = useMemo(() => {
		if (!columns) return { total: 0, done: 0, pct: 0 };
		return computeKanbanProgress(columns);
	}, [columns]);

	const failed = columns?.failed ?? [];
	const columnSpecs: ColumnSpec[] = useMemo(() => {
		const todo = columns?.pending ?? [];
		const doing = columns?.in_progress ?? [];
		const done = columns?.completed ?? [];
		const specs: ColumnSpec[] = [
			{ key: "todo", title: "To Do", cards: todo },
			{
				key: "doing",
				title: "In Progress",
				cards: doing,
				highlightInProgress: true,
			},
			{ key: "done", title: "Done", cards: done },
		];
		if (failed.length > 0) {
			specs.push({ key: "failed", title: "Gagal", cards: failed });
		}
		return specs;
	}, [columns, failed]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollButtons = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			setCanScrollLeft(false);
			setCanScrollRight(false);
			return;
		}
		const maxScroll = el.scrollWidth - el.clientWidth;
		if (maxScroll <= 0) {
			setCanScrollLeft(el.scrollLeft > 2);
			setCanScrollRight(columnSpecs.length > 1);
			return;
		}
		setCanScrollLeft(el.scrollLeft > 2);
		setCanScrollRight(el.scrollLeft < maxScroll - 2);
	}, [columnSpecs.length]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		updateScrollButtons();

		el.addEventListener("scroll", updateScrollButtons, { passive: true });

		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => {
				updateScrollButtons();
			});
			observer.observe(el);
		} else if (typeof window !== "undefined") {
			window.addEventListener("resize", updateScrollButtons);
		}

		return () => {
			el.removeEventListener("scroll", updateScrollButtons);
			if (observer) {
				observer.disconnect();
			} else if (typeof window !== "undefined") {
				window.removeEventListener("resize", updateScrollButtons);
			}
		};
	}, [updateScrollButtons]);

	const handleScrollLeft = () => {
		const el = scrollRef.current;
		if (!el) return;
		if (typeof el.scrollBy === "function") {
			el.scrollBy({ left: -236, behavior: "smooth" });
		} else {
			el.scrollLeft -= 236;
		}
		updateScrollButtons();
	};

	const handleScrollRight = () => {
		const el = scrollRef.current;
		if (!el) return;
		if (typeof el.scrollBy === "function") {
			el.scrollBy({ left: 236, behavior: "smooth" });
		} else {
			el.scrollLeft += 236;
		}
		updateScrollButtons();
	};

	const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			handleScrollLeft();
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			handleScrollRight();
		}
	};

	if (!projectId) {
		return (
			<div
				data-testid="codebase-kanban-empty-project"
				className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
			>
				<p className="text-sm font-semibold text-snow">Belum ada project</p>
				<p className="max-w-xs text-xs leading-5 text-fog">
					Buat fitur dari konteks codebase agar Papan Kanban live muncul di
					sini.
				</p>
			</div>
		);
	}

	if (isLoading && !columns) {
		return (
			<output
				data-testid="codebase-kanban-loading"
				className="flex gap-3 overflow-hidden"
			>
				{["todo", "progress", "done"].map((key) => (
					<div
						key={key}
						className="flex min-h-[220px] w-56 shrink-0 animate-pulse flex-col rounded-lg border border-graphite bg-obsidian/50"
					>
						<div className="h-9 border-b border-graphite/60" />
						<div className="flex flex-1 flex-col gap-2 p-2.5">
							<div className="h-16 rounded bg-steel/20" />
							<div className="h-12 rounded bg-steel/20" />
						</div>
					</div>
				))}
			</output>
		);
	}

	if (isError && !columns) {
		return (
			<div
				role="alert"
				data-testid="codebase-kanban-error"
				className="flex flex-col items-center gap-2 p-6 text-center"
			>
				<p className="text-sm font-semibold text-snow">Gagal memuat Kanban</p>
				<p className="max-w-xs text-xs leading-5 text-fog">
					{staleness === "disconnected"
						? "Koneksi terputus. Pastikan server aktif."
						: "Koneksi ke server bermasalah. Coba lagi."}
				</p>
				<button
					type="button"
					onClick={handleRetry}
					className="mt-1 inline-flex min-h-11 items-center rounded-md border border-graphite bg-charcoal px-3 text-xs font-medium text-snow hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		);
	}

	const hasAnyTask = progress.total > 0;

	return (
		<div data-testid="codebase-kanban-board" className="flex flex-col gap-3">
			<div className="sticky top-0 z-10 -mt-1 flex flex-col gap-2 bg-obsidian/95 pb-2 pt-1 backdrop-blur-sm">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<h3 className="text-xs font-semibold text-snow">Papan Kanban</h3>
						<span
							data-testid="codebase-kanban-progress"
							className="font-mono text-[11px] tabular-nums text-fog"
						>
							{progress.done}/{progress.total} selesai ({progress.pct}%)
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						{hasAnyTask ? (
							<div
								role="toolbar"
								aria-label="Navigasi horizontal Kanban"
								onKeyDown={handleToolbarKeyDown}
								className="flex items-center gap-1 rounded-md border border-graphite bg-charcoal p-0.5"
							>
								<button
									type="button"
									onClick={handleScrollLeft}
									disabled={!canScrollLeft}
									aria-label="Gulir kolom ke kiri"
									title="Gulir ke kiri (Panah Kiri)"
									data-testid="codebase-kanban-scroll-left"
									className="inline-flex h-6 w-6 items-center justify-center rounded text-mist transition hover:bg-obsidian hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-mist"
								>
									<ChevronLeft size={13} aria-hidden="true" />
								</button>
								<button
									type="button"
									onClick={handleScrollRight}
									disabled={!canScrollRight}
									aria-label="Gulir kolom ke kanan"
									title="Gulir ke kanan (Panah Kanan)"
									data-testid="codebase-kanban-scroll-right"
									className="inline-flex h-6 w-6 items-center justify-center rounded text-mist transition hover:bg-obsidian hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-mist"
								>
									<ChevronRight size={13} aria-hidden="true" />
								</button>
							</div>
						) : null}
						{canOpenFullBoard ? (
							<a
								href={
									codebaseId
										? `/codebases/${encodeURIComponent(codebaseId)}/kanban/${encodeURIComponent(projectId)}`
										: `/kanban/${encodeURIComponent(projectId)}`
								}
								target="_blank"
								rel="noopener noreferrer"
								data-testid="codebase-kanban-full-board"
								className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-graphite bg-charcoal px-2 text-[11px] font-medium text-mist transition hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<ExternalLink size={12} aria-hidden="true" />
								Buka Kanban Penuh
							</a>
						) : null}
					</div>
				</div>
				<div
					role="progressbar"
					aria-valuenow={progress.pct}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Progress penyelesaian task"
					className="h-1.5 w-full overflow-hidden rounded-full bg-steel/40"
				>
					<div
						className="h-full rounded-full bg-indigo transition-all duration-500"
						style={{ width: `${progress.pct}%` }}
					/>
				</div>
			</div>
			{staleness !== "live" ? (
				<p className="rounded-md border border-graphite bg-charcoal p-2 text-[11px] text-fog">
					{staleness === "stale"
						? "Koneksi lambat. Menampilkan data terakhir."
						: "Koneksi terputus. Menampilkan data terakhir."}{" "}
					<button
						type="button"
						onClick={handleRetry}
						className="underline hover:text-snow"
					>
						Coba lagi
					</button>
				</p>
			) : null}
			{hasAnyTask ? (
				<div className="relative min-w-0">
					{canScrollLeft ? (
						<div
							aria-hidden="true"
							data-testid="codebase-kanban-fade-left"
							className="pointer-events-none absolute left-0 top-0 bottom-1 z-10 w-6 bg-gradient-to-r from-obsidian to-transparent"
						/>
					) : null}
					{canScrollRight ? (
						<div
							aria-hidden="true"
							data-testid="codebase-kanban-fade-right"
							className="pointer-events-none absolute right-0 top-0 bottom-1 z-10 w-6 bg-gradient-to-l from-obsidian to-transparent"
						/>
					) : null}
					<div
						ref={scrollRef}
						data-testid="codebase-kanban-columns"
						className="flex gap-3 overflow-x-auto pb-1 scroll-smooth focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo/40 rounded-lg"
					>
						{columnSpecs.map((spec) => (
							<Column
								key={spec.key}
								title={spec.title}
								cards={spec.cards}
								highlightInProgress={spec.highlightInProgress}
							/>
						))}
					</div>
				</div>
			) : (
				<div
					data-testid="codebase-kanban-empty"
					className="rounded-lg border border-dashed border-graphite p-4 text-center"
				>
					<p className="text-xs font-semibold text-snow">
						Belum ada task di papan ini
					</p>
					<p className="mx-auto mt-1 max-w-xs text-[11px] leading-4 text-fog">
						Task muncul di sini setelah breakdown task selesai dan tersimpan.
					</p>
				</div>
			)}
			{failed.length > 0 ? (
				<p
					data-testid="codebase-kanban-failed-note"
					className="rounded-md border border-crimson/30 bg-crimson/10 p-2 text-[11px] leading-5 text-crimson"
				>
					{failed.length} task gagal dan tetap ditampilkan di kolom Gagal.
				</p>
			) : null}
		</div>
	);
}

export function getCodebaseKanbanProgress(input: {
	done: number;
	total: number;
}): { done: number; total: number; pct: number } {
	const total =
		Number.isFinite(input.total) && input.total > 0 ? input.total : 0;
	const done =
		Number.isFinite(input.done) && input.done > 0
			? Math.min(input.done, total)
			: 0;
	return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}
