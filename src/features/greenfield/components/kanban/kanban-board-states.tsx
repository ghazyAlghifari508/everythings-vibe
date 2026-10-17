"use client";

import { KanbanSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Placeholder columns shown while the first Kanban payload is loading. */
export function KanbanBoardSkeleton() {
	return (
		<div className="flex h-dvh w-full flex-col bg-onyx text-snow overflow-hidden">
			<header className="border-b border-graphite bg-obsidian px-4 sm:px-6 py-3.5 shrink-0">
				<div className="mx-auto flex w-full max-w-[1400px] items-center justify-between">
					<div className="h-6 w-48 animate-pulse rounded bg-steel/20" />
					<div className="h-8 w-24 animate-pulse rounded bg-steel/20" />
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-[1400px] flex-1 min-h-0 gap-4 py-6 px-4 sm:px-6 lg:px-8 overflow-hidden">
				{["pending", "in_progress", "completed", "failed"].map((status) => (
					<div
						key={status}
						className="flex h-full flex-1 min-w-[260px] shrink-0 flex-col rounded-xl border border-graphite bg-obsidian/30 animate-pulse"
					>
						<div className="h-12 border-b border-graphite/40 bg-obsidian/50 rounded-t-xl" />
						<div className="flex-1 p-3 space-y-3">
							<div className="h-24 rounded bg-steel/10" />
							<div className="h-20 rounded bg-steel/10" />
						</div>
					</div>
				))}
			</main>
		</div>
	);
}

/** First-load failure view with a retry affordance. */
export function KanbanBoardError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-full w-full flex-col bg-onyx text-snow items-center justify-center p-6">
			<AlertTriangleIllustration />
			<h2 className="mt-4 text-lg font-bold text-snow">Gagal memuat Kanban</h2>
			<p className="mt-2 text-sm text-fog max-w-xs text-center">
				Koneksi ke server bermasalah. Pastikan internet Anda aktif dan coba
				lagi.
			</p>
			<Button onClick={onRetry} variant="default" className="mt-6 gap-1.5">
				<Loader2 size={14} className="hidden" />
				Coba Lagi
			</Button>
		</div>
	);
}

/** Skeleton columns shown while the AI is still generating tasks. */
export function KanbanGeneratingSkeleton() {
	return (
		<div className="flex h-full min-w-full gap-4">
			{["pending", "in_progress", "completed", "failed"].map((status) => (
				<div
					key={status}
					className="flex h-full flex-1 min-w-[260px] shrink-0 flex-col rounded-xl border border-graphite bg-obsidian/30 animate-pulse"
				>
					<div className="h-12 border-b border-graphite/40 bg-obsidian/50 rounded-t-xl flex items-center px-4">
						<div className="h-4 w-24 rounded bg-steel/20" />
					</div>
					<div className="flex-1 p-3 space-y-3">
						<div className="h-24 rounded bg-steel/10" />
						<div className="h-20 rounded bg-steel/10" />
						<div className="h-16 rounded bg-steel/10" />
					</div>
				</div>
			))}
		</div>
	);
}

/** Shown when the project has no tasks at all yet. */
export function KanbanEmptyState() {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center text-center">
			<KanbanSquare size={56} className="text-fog/40 mb-3" />
			<h2 className="text-base font-[510] text-snow">Belum ada task</h2>
			<p className="text-xs text-fog max-w-sm mt-1.5 leading-relaxed">
				Task akan muncul di sini setelah proses generate selesai.
			</p>
		</div>
	);
}

/** Shown when the active phase filter matches no tasks. */
export function KanbanEmptyPhase({
	phaseLabel,
	onShowAll,
}: {
	phaseLabel: string;
	onShowAll: () => void;
}) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center text-center">
			<p className="text-sm font-[510] text-snow">
				Tidak ada task pada fase ini
			</p>
			<p className="text-xs text-fog max-w-sm mt-1.5 leading-relaxed">
				Tidak ada task yang terhubung dengan &ldquo;{phaseLabel}
				&rdquo;.
			</p>
			<button
				type="button"
				onClick={onShowAll}
				className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-3 py-1.5 text-xs font-[510] text-snow hover:border-steel transition-colors"
			>
				Tampilkan Semua
			</button>
		</div>
	);
}

function AlertTriangleIllustration() {
	return (
		<div className="rounded-full bg-crimson/15 p-4 text-crimson">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="32"
				height="32"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				role="img"
				aria-label="Peringatan Galat"
			>
				<title>Peringatan Galat</title>
				<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
				<line x1="12" y1="9" x2="12" y2="13" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
		</div>
	);
}
