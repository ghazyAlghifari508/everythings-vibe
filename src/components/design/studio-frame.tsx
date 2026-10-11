import {
	AlertCircle,
	Check,
	Copy,
	Loader2,
	Monitor,
	RotateCcw,
	Smartphone,
} from "lucide-react";
import { useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import { extractCleanHtml } from "@/lib/clean-html";
import { StudioFrameSkeleton } from "./studio-frame-skeleton";

export interface StudioFrameProps {
	frame: StudioFrameRow;
	isSelected?: boolean;
	onSelect?: (frameId: string) => void;
	onRetry?: (frameId: string) => void;
	isCanvasPanning?: boolean;
	className?: string;
}

export function StudioFrame({
	frame,
	isSelected = false,
	onSelect,
	onRetry,
	isCanvasPanning = false,
	className = "",
}: StudioFrameProps) {
	const [copied, setCopied] = useState(false);
	const isMobile = frame.viewport === "mobile";
	const frameWidth = isMobile ? 375 : 1200;
	const frameHeight = isMobile ? 740 : 750;

	const cleanHtml = frame.htmlCode ? extractCleanHtml(frame.htmlCode) : "";

	async function handleCopy(e: React.MouseEvent) {
		e.stopPropagation();
		if (!cleanHtml) return;
		try {
			await navigator.clipboard.writeText(cleanHtml);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard permission failed
		}
	}

	return (
		<article
			aria-label={`Frame ${frame.name}`}
			className={`flex flex-col gap-2 transition-all select-none ${className}`}
		>
			{/* Frame Title Bar */}
			<div className="flex items-center justify-between px-1">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => onSelect?.(frame.id)}
						className="flex items-center gap-1.5 text-xs font-semibold text-snow hover:text-mist focus:outline-none"
					>
						{isMobile ? (
							<Smartphone size={13} className="text-fog" aria-hidden />
						) : (
							<Monitor size={13} className="text-fog" aria-hidden />
						)}
						<span>{frame.name}</span>
					</button>

					{/* Generation Status Indicator */}
					{frame.status === "generating" && (
						<span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
							<Loader2 size={10} className="animate-spin" aria-hidden />
							<span>Menggenerate...</span>
						</span>
					)}
					{frame.status === "queued" && (
						<span className="inline-flex items-center rounded-full bg-graphite/40 px-2 py-0.5 text-[10px] font-medium text-fog">
							Menunggu
						</span>
					)}
					{frame.status === "failed" && (
						<span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
							<AlertCircle size={10} aria-hidden />
							<span>Gagal</span>
						</span>
					)}
				</div>

				{/* Quick Actions (Copy / Retry) */}
				<div className="flex items-center gap-1.5">
					{frame.status === "ready" && cleanHtml && (
						<button
							type="button"
							onClick={(e) => void handleCopy(e)}
							aria-label={`Salin HTML ${frame.name}`}
							className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-fog hover:bg-onyx hover:text-snow transition-colors"
						>
							{copied ? (
								<>
									<Check size={11} className="text-emerald-400" />
									<span className="text-emerald-400">Tersalin</span>
								</>
							) : (
								<>
									<Copy size={11} />
									<span>Salin</span>
								</>
							)}
						</button>
					)}
					{frame.status === "failed" && onRetry && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onRetry(frame.id);
							}}
							aria-label={`Coba lagi generate ${frame.name}`}
							className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400 hover:bg-red-500/20 transition-colors"
						>
							<RotateCcw size={11} />
							<span>Coba lagi</span>
						</button>
					)}
				</div>
			</div>

			{/* Frame Content Box */}
			<div
				className={`relative overflow-hidden transition-all ${
					isMobile ? "rounded-[24px]" : "rounded-xl"
				} border ${
					isSelected
						? "border-indigo-500 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/10"
						: "border-graphite hover:border-steel"
				} bg-obsidian`}
				style={{ width: frameWidth, height: frameHeight }}
			>
				{frame.status === "ready" && cleanHtml ? (
					<iframe
						title={`Preview frame ${frame.name}`}
						srcDoc={cleanHtml}
						sandbox="allow-scripts"
						className={`size-full border-0 ${
							isCanvasPanning ? "pointer-events-none" : ""
						}`}
						tabIndex={isSelected ? 0 : -1}
					/>
				) : frame.status === "failed" ? (
					<div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
						<div className="flex size-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
							<AlertCircle size={20} />
						</div>
						<div className="space-y-1">
							<p className="text-sm font-semibold text-snow">
								Gagal Menggenerate Layar
							</p>
							<p className="text-xs text-fog max-w-xs">
								{frame.error || "Terjadi kesalahan saat memproses prompt."}
							</p>
						</div>
						{onRetry && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRetry(frame.id);
								}}
								className="inline-flex items-center gap-1.5 rounded-full border border-graphite bg-charcoal px-4 py-1.5 text-xs font-semibold text-snow hover:bg-onyx transition-colors"
							>
								<RotateCcw size={13} />
								<span>Coba lagi</span>
							</button>
						)}
					</div>
				) : (
					<StudioFrameSkeleton
						name={frame.name}
						description={frame.description}
						viewport={frame.viewport}
					/>
				)}
			</div>
		</article>
	);
}
