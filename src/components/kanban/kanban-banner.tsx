"use client";

import { AlertTriangle, Info, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface KanbanBannerProps {
	staleness: "live" | "stale" | "disconnected";
	hasUpdates: boolean;
	onRetry: () => void;
	isRetrying?: boolean;
	onDismiss?: () => void;
}

export function KanbanBanner({
	staleness,
	hasUpdates,
	onRetry,
	isRetrying = false,
	onDismiss,
}: KanbanBannerProps) {
	if (staleness === "live" && hasUpdates) return null;

	return (
		<div className="flex flex-col gap-2 p-4 pb-0">
			{staleness === "stale" && (
				<div className="flex items-center justify-between rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber animate-slide-down">
					<div className="flex items-center gap-2">
						<AlertTriangle size={16} className="shrink-0" />
						<span>Koneksi lambat. Menampilkan data terakhir.</span>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={onRetry}
							disabled={isRetrying}
							className="h-8 border border-amber/30 text-amber hover:bg-amber/10 hover:text-amber"
						>
							<RefreshCw
								size={12}
								className={`mr-1.5 ${isRetrying ? "animate-spin" : ""}`}
							/>
							Coba lagi
						</Button>
						{onDismiss && (
							<Button
								variant="ghost"
								size="sm"
								onClick={onDismiss}
								className="h-8 text-amber/60 hover:text-amber hover:bg-amber/10"
								aria-label="Dismiss"
							>
								<X size={14} />
							</Button>
						)}
					</div>
				</div>
			)}

			{staleness === "disconnected" && (
				<div className="flex items-center justify-between rounded-md border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson animate-slide-down animate-pulse">
					<div className="flex items-center gap-2">
						<AlertTriangle size={16} className="shrink-0" />
						<span>Koneksi terputus. Pastikan server aktif.</span>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="default"
							size="sm"
							onClick={onRetry}
							disabled={isRetrying}
							className="h-8 bg-crimson text-white hover:bg-crimson/90"
						>
							<RefreshCw
								size={12}
								className={`mr-1.5 ${isRetrying ? "animate-spin" : ""}`}
							/>
							Hubungkan Kembali
						</Button>
						{onDismiss && (
							<Button
								variant="ghost"
								size="sm"
								onClick={onDismiss}
								className="h-8 text-crimson/60 hover:text-crimson hover:bg-crimson/10"
								aria-label="Dismiss"
							>
								<X size={14} />
							</Button>
						)}
					</div>
				</div>
			)}

			{!hasUpdates && (
				<div className="flex items-center justify-between rounded-md border border-indigo/30 bg-indigo/10 p-3 text-sm text-indigo animate-slide-down">
					<div className="flex items-center gap-2">
						<Info size={16} className="shrink-0" />
						<span>
							Belum ada update status. Jalankan VibeEverything CLI untuk update otomatis.
						</span>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{onDismiss && (
							<Button
								variant="ghost"
								size="sm"
								onClick={onDismiss}
								className="h-8 text-indigo/60 hover:text-indigo hover:bg-indigo/10"
								aria-label="Dismiss"
							>
								<X size={14} />
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
