"use client";

import { useMemo } from "react";
import { type TaskCard, useKanbanTasks } from "@/hooks/use-kanban-polling";
import { computeKanbanProgress } from "@/lib/kanban-utils";

interface CodebaseKanbanBoardProps {
	projectId: string | null;
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
}

function Column({
	title,
	count,
	cards,
	highlightInProgress,
}: {
	title: string;
	count: number;
	cards: TaskCard[];
	highlightInProgress?: boolean;
}) {
	return (
		<div
			data-testid={`codebase-kanban-col-${title}`}
			className="flex min-h-[280px] flex-col rounded-lg border border-graphite bg-obsidian"
		>
			<div className="flex items-center justify-between border-b border-graphite px-3 py-2">
				<p className="text-[11.5px] font-semibold text-mist">{title}</p>
				<span className="rounded-full bg-charcoal px-1.5 py-px font-mono text-[10px] text-slate">
					{count}
				</span>
			</div>
			<div className="flex flex-1 flex-col gap-2 p-2.5">
				{cards.length === 0 ? (
					<p className="rounded-md border border-dashed border-graphite p-2 text-center text-[11px] text-slate">
						Belum ada task
					</p>
				) : (
					cards.map((card) => (
						<div
							key={card.id}
							data-testid="codebase-kanban-card"
							className={`flex flex-col gap-1.5 rounded-md border bg-charcoal p-2.5 ${
								highlightInProgress
									? "border-indigo/40 bg-indigo/5"
									: "border-graphite"
							}`}
						>
							<span className="w-fit rounded border border-graphite bg-obsidian px-1 py-px font-mono text-[9.5px] uppercase text-fog">
								{card.featureName}
							</span>
							<p className="line-clamp-2 text-xs font-semibold leading-5 text-snow">
								{card.name}
							</p>
							{highlightInProgress ? (
								<span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-indigo">
									<span
										aria-hidden="true"
										className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo"
									/>
									Agent coding...
								</span>
							) : null}
							<span className="font-mono text-[10px] text-slate">
								{typeof card.subtaskCompleted === "number" &&
								typeof card.subtaskCount === "number"
									? `${card.subtaskCompleted}/${card.subtaskCount} subtask`
									: card.status}
							</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}

export function CodebaseKanbanBoard({
	projectId,
	columns: columnsProp,
	staleness: stalenessProp,
	isLoadingExternal,
	isErrorExternal,
	onRetryExternal,
}: CodebaseKanbanBoardProps) {
	const hook = useKanbanTasks({
		projectId: projectId ?? "",
		enabled: Boolean(projectId) && columnsProp === undefined,
	});
	const data = columnsProp !== undefined ? null : hook.data;
	const columns = columnsProp ?? data?.columns ?? null;
	const staleness = stalenessProp ?? hook.staleness;
	const isLoading = isLoadingExternal ?? hook.isLoading;
	const isError = isErrorExternal ?? hook.isError;
	const handleRetry = () => {
		if (onRetryExternal) onRetryExternal();
		else void hook.refetch();
	};

	const progress = useMemo(() => {
		if (!columns) return { total: 0, done: 0, pct: 0 };
		return computeKanbanProgress(columns);
	}, [columns]);

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

	if (isLoading && !data) {
		return (
			<output
				data-testid="codebase-kanban-loading"
				className="grid grid-cols-3 gap-3"
			>
				{["todo", "progress", "done"].map((key) => (
					<div
						key={key}
						className="flex min-h-[280px] animate-pulse flex-col rounded-lg border border-graphite bg-obsidian/50"
					>
						<div className="h-9 border-b border-graphite/60" />
						<div className="flex flex-1 flex-col gap-2 p-2.5">
							<div className="h-20 rounded bg-steel/20" />
							<div className="h-16 rounded bg-steel/20" />
						</div>
					</div>
				))}
			</output>
		);
	}

	if (isError && !data) {
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

	const todo = columns?.pending ?? [];
	const doing = columns?.in_progress ?? [];
	const done = columns?.completed ?? [];
	const failed = columns?.failed ?? [];

	return (
		<div data-testid="codebase-kanban-board" className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<div
					role="progressbar"
					aria-valuenow={progress.pct}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Progress penyelesaian task"
					className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-steel/40"
				>
					<div
						className="h-full rounded-full bg-indigo transition-all duration-500"
						style={{ width: `${progress.pct}%` }}
					/>
				</div>
				<span
					data-testid="codebase-kanban-progress"
					className="shrink-0 font-mono text-[11px] tabular-nums text-fog"
				>
					{progress.done}/{progress.total} selesai ({progress.pct}%)
				</span>
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
			<div className="grid grid-cols-3 gap-3">
				<Column title="To Do" count={todo.length} cards={todo} />
				<Column
					title="In Progress"
					count={doing.length}
					cards={doing}
					highlightInProgress
				/>
				<Column title="Done" count={done.length} cards={done} />
			</div>
			{failed.length > 0 ? (
				<p
					data-testid="codebase-kanban-failed-note"
					className="rounded-md border border-crimson/30 bg-crimson/10 p-2 text-[11px] leading-5 text-crimson"
				>
					{failed.length} task gagal dan tidak disembunyikan. Buka board penuh
					untuk meninjau dan mengulang task tersebut.
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
