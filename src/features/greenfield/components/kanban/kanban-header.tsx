"use client";

import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowUpDown,
	Info,
	KanbanSquare,
	RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface KanbanHeaderProps {
	projectId: string;
	projectName: string;
	navigationContext?: {
		codebaseId: string;
		codebaseName: string;
	};
	projectProgress: { total: number; done: number; pct: number };
	lastUpdateAt?: string | null;
	staleness: string;
	isLoading: boolean;
	hasUpdates: boolean;
	canReset: boolean;
	isResetting: boolean;
	onRefetch: () => void;
	onOpenResetDialog: () => void;
}

/** Top bar: title, CLI connection status, and the action cluster. */
export function KanbanHeader({
	projectId,
	projectName,
	navigationContext,
	projectProgress,
	lastUpdateAt,
	staleness,
	isLoading,
	hasUpdates,
	canReset,
	isResetting,
	onRefetch,
	onOpenResetDialog,
}: KanbanHeaderProps) {
	return (
		<header className="border-b border-graphite bg-obsidian px-4 sm:px-6 py-3.5 shrink-0">
			<div className="mx-auto flex w-full max-w-[1400px] flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
				<div className="flex flex-col min-w-0">
					<div className="flex items-center gap-2.5 min-w-0">
						<KanbanSquare size={18} className="text-indigo shrink-0" />
						<h1 className="truncate font-inter text-base sm:text-lg font-[600] text-snow">
							{navigationContext ? projectName : `Kanban - ${projectName}`}
						</h1>
					</div>
					{navigationContext ? (
						<p className="mt-1 truncate text-xs text-fog">
							{navigationContext.codebaseName} / {projectName} ·{" "}
							{projectProgress.done}/{projectProgress.total} task selesai (
							{projectProgress.pct}%)
						</p>
					) : null}

					{/* CLI / Connection status as supporting metadata */}
					<div className="mt-1 flex items-center gap-1.5 text-xs min-w-0">
						{staleness === "disconnected" ? (
							<output className="flex items-center gap-1.5 text-crimson min-w-0">
								<AlertTriangle
									size={13}
									className="shrink-0"
									aria-hidden="true"
								/>
								<span className="truncate">
									Koneksi terputus · Pastikan server aktif
								</span>
								<button
									type="button"
									onClick={onRefetch}
									disabled={isLoading}
									className="underline hover:text-snow cursor-pointer text-xs ml-1 shrink-0"
								>
									Hubungkan kembali
								</button>
							</output>
						) : staleness === "stale" ? (
							<output className="flex items-center gap-1.5 text-amber min-w-0">
								<AlertTriangle
									size={13}
									className="shrink-0"
									aria-hidden="true"
								/>
								<span className="truncate">
									Koneksi lambat · Menampilkan data terakhir
								</span>
								<button
									type="button"
									onClick={onRefetch}
									disabled={isLoading}
									className="underline hover:text-snow cursor-pointer text-xs ml-1 shrink-0"
								>
									Coba lagi
								</button>
							</output>
						) : !hasUpdates ? (
							<output className="flex items-center gap-1.5 text-fog min-w-0">
								<Info
									size={13}
									className="shrink-0 text-slate"
									aria-hidden="true"
								/>
								<span className="truncate">
									Belum ada update status · Jalankan VibeEverything CLI untuk
									update otomatis
								</span>
							</output>
						) : (
							<output className="flex items-center gap-1.5 text-fog min-w-0">
								<span
									className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
									aria-hidden="true"
								/>
								<span className="truncate">Tersinkronisasi dengan CLI</span>
							</output>
						)}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 self-start sm:self-center">
					{lastUpdateAt && (
						<span className="text-[10px] text-fog/60 font-mono hidden md:inline">
							Update: {new Date(lastUpdateAt).toLocaleTimeString()}
						</span>
					)}
					{canReset && (
						<Button
							variant="outline"
							size="sm"
							onClick={onOpenResetDialog}
							disabled={isResetting}
							className="gap-1.5"
						>
							<RotateCcw size={14} />
							{isResetting ? "Mereset..." : "Reset Progress"}
						</Button>
					)}
					{navigationContext ? (
						<Link
							to="/codebases/$id"
							params={{ id: navigationContext.codebaseId }}
							aria-label={`Kembali ke workspace ${navigationContext.codebaseName}`}
							className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-snow/40 px-3 py-1.5 text-xs font-[510] text-snow transition-colors hover:border-snow/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<ArrowLeft size={14} aria-hidden="true" />
							Kembali ke Workspace
						</Link>
					) : (
						<>
							<Link
								to="/task/$id"
								params={{ id: projectId }}
								className="btn-primary px-3 py-1.5 rounded-md text-xs font-[510]"
							>
								Roadmap
							</Link>
							<Link
								to="/plan/new"
								className="px-3 py-1.5 rounded-md text-xs font-[510] flex items-center gap-1.5 border border-snow/40 text-snow hover:border-snow/70 transition-colors bg-transparent"
							>
								Kembali ke Chat
							</Link>
						</>
					)}
				</div>
			</div>
		</header>
	);
}

/** Banner shown when AC changed after the tasks were generated. */
export function KanbanAcChangedBanner({
	onDismiss,
}: {
	onDismiss: () => void;
}) {
	return (
		<div className="w-full shrink-0 px-4 pt-3">
			<div className="flex items-center justify-between rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber animate-slide-down">
				<div className="flex items-center gap-2">
					<AlertTriangle size={16} className="shrink-0" />
					<span>
						AC telah berubah. Task mungkin tidak sesuai kriteria terbaru.
					</span>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={onDismiss}
					className="h-8 text-amber/80 hover:text-amber hover:bg-amber/10"
				>
					<ArrowUpDown size={12} className="mr-1" />
					Tutup
				</Button>
			</div>
		</div>
	);
}
