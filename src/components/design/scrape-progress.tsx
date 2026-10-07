import { AlertCircle, Check, Loader2, RotateCcw } from "lucide-react";
import {
	HTML_SCRAPE_STATUS_LABELS,
	SCRAPE_STATUS_LABELS,
	type ScrapeMode,
	type ScrapeStatus,
	scrapeProgressForStatus,
} from "@/db/schema";

export interface ScrapeProgressProps {
	status: ScrapeStatus;
	mode?: ScrapeMode;
	sourceUrl?: string;
	domain?: string;
	errorMessage?: string | null;
	isRetrying?: boolean;
	onRetry?: () => void;
}

const ORDERED_DESIGN_STAGES: ScrapeStatus[] = [
	"queued",
	"capturing",
	"extracting",
	"generating",
	"saving",
	"completed",
];

const ORDERED_HTML_STAGES: ScrapeStatus[] = [
	"queued",
	"capturing",
	"extracting",
	"saving",
	"completed",
];

const DESIGN_STAGE_DESCRIPTIONS: Record<ScrapeStatus, string> = {
	queued: "Menunggu antrean pemrosesan visual…",
	capturing: "Mengambil HTML dan aset visual dari halaman publik…",
	extracting: "Membaca palet warna, tipografi, dan pola komponen…",
	generating: "AI sedang menyusun dokumentasi sistem desain lengkap…",
	saving: "Menyimpan dokumen DESIGN.md…",
	completed: "Panduan desain DESIGN.md siap digunakan.",
	failed: "Proses pembuatan DESIGN.md terhenti sebelum selesai.",
};

const HTML_STAGE_DESCRIPTIONS: Record<ScrapeStatus, string> = {
	queued: "Menunggu antrean scrape HTML…",
	capturing: "Mengambil HTML dan aset dari halaman publik…",
	extracting: "Memproses resource dan menyiapkan preview…",
	generating: "Memproses resource dan menyiapkan preview…",
	saving: "Menyimpan index.html…",
	completed: "Hasil scraping index.html siap digunakan.",
	failed: "Proses scraping HTML terhenti sebelum selesai.",
};

export function ScrapeProgress({
	status,
	mode = "design",
	sourceUrl,
	domain,
	errorMessage,
	isRetrying = false,
	onRetry,
}: ScrapeProgressProps) {
	const progress = scrapeProgressForStatus(status, mode);
	const isFailed = status === "failed";
	const isDone = status === "completed";

	const orderedStages =
		mode === "html" ? ORDERED_HTML_STAGES : ORDERED_DESIGN_STAGES;
	const stageLabels =
		mode === "html" ? HTML_SCRAPE_STATUS_LABELS : SCRAPE_STATUS_LABELS;
	const stageDescriptions =
		mode === "html" ? HTML_STAGE_DESCRIPTIONS : DESIGN_STAGE_DESCRIPTIONS;
	const currentIndex = orderedStages.indexOf(status);

	const progressLabel =
		mode === "html" ? "Progres scraping HTML" : "Progres pembuatan DESIGN.md";
	const defaultError =
		mode === "html"
			? "Scrape HTML belum bisa diselesaikan. Coba ulangi dari link yang sama."
			: "DESIGN.md belum bisa dibuat. Coba ulangi dari link yang sama.";

	return (
		<div className="w-full rounded-2xl border border-graphite bg-charcoal p-6 sm:p-8">
			{/* Header */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<span className="font-mono text-xs uppercase tracking-wider text-fog">
						Status Pemrosesan {mode === "html" ? "(HTML)" : "(DESIGN.md)"}
					</span>
					<h2 className="text-xl font-semibold text-snow">
						{domain || (sourceUrl ? new URL(sourceUrl).hostname : "Website")}
					</h2>
					{sourceUrl ? (
						<p className="mt-0.5 truncate font-mono text-xs text-fog max-w-xl">
							{sourceUrl}
						</p>
					) : null}
				</div>

				<div className="flex items-center gap-2 self-start rounded-full border border-graphite bg-onyx px-3.5 py-1.5 font-mono text-xs font-semibold text-snow sm:self-auto">
					{!isDone && !isFailed ? (
						<Loader2 size={14} className="animate-spin text-mist" />
					) : null}
					<span>{stageLabels[status] ?? status}</span>
					<span className="text-fog">{`(${progress}%)`}</span>
				</div>
			</div>

			{/* Progress Bar */}
			<div className="mt-6">
				<div
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={progress}
					aria-label={progressLabel}
					className="h-2 w-full overflow-hidden rounded-full bg-onyx"
				>
					<div
						className={`h-full transition-all duration-500 ease-out ${
							isFailed
								? "bg-rose-500"
								: isDone
									? "bg-emerald-500"
									: "bg-indigo-500"
						}`}
						style={{ width: `${progress}%` }}
					/>
				</div>
				<p aria-live="polite" className="mt-2.5 text-xs text-fog">
					{isFailed
						? errorMessage || defaultError
						: (stageDescriptions[status] ?? "Sedang memproses website…")}
				</p>
			</div>

			{/* Error and Retry */}
			{isFailed ? (
				<div className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
					<div className="flex items-start gap-3">
						<AlertCircle
							size={18}
							className="mt-0.5 shrink-0 text-rose-400"
							aria-hidden="true"
						/>
						<div className="flex-1">
							<p className="text-sm font-semibold text-rose-200">
								{errorMessage || defaultError}
							</p>
							<p className="mt-1 text-xs text-rose-300/80">
								Pastikan website publik dapat diakses tanpa login atau bot
								protection.
							</p>
							{onRetry ? (
								<button
									type="button"
									onClick={onRetry}
									disabled={isRetrying}
									className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
								>
									{isRetrying ? (
										<Loader2 size={14} className="animate-spin" />
									) : (
										<RotateCcw size={14} />
									)}
									<span>Coba lagi</span>
								</button>
							) : null}
						</div>
					</div>
				</div>
			) : (
				/* Stage Tracker */
				<div className="mt-8 border-t border-graphite/60 pt-6">
					<ol
						className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
							mode === "html" ? "lg:grid-cols-5" : "lg:grid-cols-6"
						}`}
					>
						{orderedStages.map((s, idx) => {
							const isStageDone =
								isDone || (currentIndex >= 0 && idx < currentIndex);
							const isStageCurrent = currentIndex === idx && !isDone;

							return (
								<li
									key={s}
									className={`flex items-center gap-2 rounded-lg p-2 font-mono text-xs ${
										isStageDone
											? "text-emerald-400"
											: isStageCurrent
												? "bg-onyx font-semibold text-snow"
												: "text-fog/60"
									}`}
								>
									{isStageDone ? (
										<span className="grid size-5 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
											<Check size={12} strokeWidth={3} />
										</span>
									) : isStageCurrent ? (
										<span className="grid size-5 place-items-center rounded-full bg-indigo-500/20 text-indigo-400">
											<Loader2 size={12} className="animate-spin" />
										</span>
									) : (
										<span className="size-2 rounded-full bg-graphite mx-1.5" />
									)}
									<span className="truncate">{stageLabels[s] ?? s}</span>
								</li>
							);
						})}
					</ol>
				</div>
			)}
		</div>
	);
}
