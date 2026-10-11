import {
	AlertCircle,
	Check,
	Copy,
	Loader2,
	Monitor,
	RotateCcw,
	Smartphone,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import { extractCleanHtml } from "@/lib/clean-html";
import { StudioFrameSkeleton } from "./studio-frame-skeleton";

export interface StudioFrameProps {
	frame: StudioFrameRow;
	isSelected?: boolean;
	onSelect?: (frameId: string, additive?: boolean) => void;
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
	const [visual, setVisual] = useState<{
		url: string;
		width: number;
		height: number;
	} | null>(null);
	const [visualError, setVisualError] = useState("");
	const [visualAttempt, setVisualAttempt] = useState(0);
	const artboardRef = useRef<HTMLElement>(null);
	const frameHeight = visual?.height ?? (isMobile ? 740 : 750);
	useEffect(() => {
		if (!frame.htmlCode || !artboardRef.current) return;
		const controller = new AbortController();
		let started = false;
		async function load() {
			if (started) return;
			started = true;
			setVisualError("");
			try {
				const response = await fetch(
					`/api/studio/frame?projectId=${encodeURIComponent(frame.projectId)}&frameId=${encodeURIComponent(frame.id)}&attempt=${visualAttempt}`,
					{ signal: controller.signal },
				);
				const data: unknown = await response.json();
				if (
					!response.ok ||
					typeof data !== "object" ||
					data === null ||
					!("url" in data) ||
					typeof data.url !== "string" ||
					!("width" in data) ||
					typeof data.width !== "number" ||
					!("height" in data) ||
					typeof data.height !== "number"
				)
					throw new Error("Gagal menyiapkan visual frame.");
				setVisual({ url: data.url, width: data.width, height: data.height });
			} catch (failure) {
				if (!controller.signal.aborted)
					setVisualError(
						failure instanceof Error
							? failure.message
							: "Visual frame gagal dimuat.",
					);
			}
		}
		const observer =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver(
						(entries) => {
							if (entries.some((entry) => entry.isIntersecting)) void load();
						},
						{ rootMargin: "600px" },
					);
		if (observer) observer.observe(artboardRef.current);
		else void load();
		return () => {
			controller.abort();
			observer?.disconnect();
		};
	}, [frame.id, frame.projectId, frame.htmlCode, visualAttempt]);

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
			ref={artboardRef}
			aria-label={`Frame ${frame.name}`}
			className={`flex flex-col gap-2 transition-all select-none ${className}`}
		>
			{/* Frame Title Bar */}
			<div className="flex items-center justify-between px-1">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={(event) => {
							if (!isCanvasPanning) onSelect?.(frame.id, event.shiftKey);
						}}
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
				style={{ width: visual?.width ?? frameWidth, height: frameHeight }}
			>
				{frame.status === "ready" && cleanHtml ? (
					visual ? (
						<button
							type="button"
							aria-label={`Pilih frame ${frame.name}`}
							aria-pressed={isSelected}
							onClick={(event) => {
								if (!isCanvasPanning) onSelect?.(frame.id, event.shiftKey);
							}}
							className="block size-full focus-visible:outline-2 focus-visible:outline-snow"
						>
							<img
								src={visual.url}
								width={visual.width}
								height={visual.height}
								alt={`Desain ${frame.name}`}
								draggable={false}
								className="size-full pointer-events-none"
								onError={() => setVisualError("Gambar frame gagal dimuat.")}
							/>
						</button>
					) : (
						<div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-sm text-fog">
							{visualError ? (
								<>
									<p role="alert">{visualError}</p>
									<button
										type="button"
										onClick={() => setVisualAttempt((attempt) => attempt + 1)}
										className="rounded border border-iron px-3 py-2 text-snow"
									>
										Coba lagi visual
									</button>
								</>
							) : (
								<span>Menyiapkan visual {frame.name}…</span>
							)}
						</div>
					)
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
