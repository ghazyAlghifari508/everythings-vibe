import { AlertCircle, Check, Loader2, RotateCcw } from "lucide-react";
import { ThoughtLine } from "@/components/ui/thought-line";
import {
	HTML_SCRAPE_STATUS_LABELS,
	SCRAPE_STATUS_LABELS,
	type ScrapeMode,
	type ScrapeStatus,
} from "@/db/schema";
import { displaySiteName } from "@/lib/site-name";

export interface ScrapeProgressProps {
	status: ScrapeStatus;
	mode?: ScrapeMode;
	sourceUrl?: string;
	domain?: string;
	errorMessage?: string | null;
	isRetrying?: boolean;
	onRetry?: () => void;
	stageStartedAt?: string | null;
	activity?: string | null;
	activityStartedAt?: string | null;
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
	queued: "Menunggu giliran pemrosesan.",
	capturing:
		"Membuka website di browser dan menunggu tampilan serta aset selesai dimuat.",
	extracting: "Membaca warna, tipografi, spacing, komponen, dan pola layout.",
	generating:
		"AI sedang menyusun DESIGN.md lengkap dari hasil analisis visual.",
	saving: "Menyimpan DESIGN.md yang sudah selesai.",
	completed: "Panduan desain DESIGN.md siap digunakan.",
	failed: "Proses pembuatan DESIGN.md terhenti sebelum selesai.",
};

const HTML_STAGE_DESCRIPTIONS: Record<ScrapeStatus, string> = {
	queued: "Menunggu giliran pemrosesan.",
	capturing: "Membuka website di browser dan menjalankan JavaScript halaman.",
	extracting: "Menyiapkan HTML standalone dan resource untuk preview.",
	generating: "Menyiapkan HTML standalone dan resource untuk preview.",
	saving: "Menyimpan index.html yang sudah selesai.",
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
	stageStartedAt,
	activity,
	activityStartedAt,
}: ScrapeProgressProps) {
	const isFailed = status === "failed";
	const isDone = status === "completed";

	const orderedStages =
		mode === "html" ? ORDERED_HTML_STAGES : ORDERED_DESIGN_STAGES;
	const stageLabels =
		mode === "html" ? HTML_SCRAPE_STATUS_LABELS : SCRAPE_STATUS_LABELS;
	const stageDescriptions =
		mode === "html" ? HTML_STAGE_DESCRIPTIONS : DESIGN_STAGE_DESCRIPTIONS;
	const currentIndex = orderedStages.indexOf(status);
	const currentLabel = stageLabels[status] ?? status;

	const defaultError =
		mode === "html"
			? "Scrape HTML belum bisa diselesaikan. Coba ulangi dari link yang sama."
			: "DESIGN.md belum bisa dibuat. Coba ulangi dari link yang sama.";
	const siteName = domain
		? displaySiteName(domain)
		: sourceUrl
			? displaySiteName(new URL(sourceUrl).hostname)
			: "Website";

	return (
		<div className="w-full rounded-2xl border border-graphite bg-charcoal p-6 sm:p-8">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<span className="font-mono text-xs uppercase tracking-wider text-fog">
						Status Pemrosesan {mode === "html" ? "(HTML)" : "(DESIGN.md)"}
					</span>
					<h2 className="text-xl font-semibold text-snow">{siteName}</h2>
					{sourceUrl ? (
						<p className="mt-0.5 truncate font-mono text-xs text-fog max-w-xl">
							{sourceUrl}
						</p>
					) : null}
				</div>

				<p className="flex items-center gap-2 font-mono text-xs font-semibold text-snow">
					{!isDone && !isFailed ? (
						<Loader2
							size={14}
							className="motion-safe:animate-spin motion-reduce:animate-none text-mist"
						/>
					) : null}
					<span aria-live="polite">{currentLabel}</span>
				</p>
			</div>

			{!isFailed ? (
				<div
					role="progressbar"
					aria-label="Tahap pemrosesan scraping"
					aria-valuemin={1}
					aria-valuemax={orderedStages.length}
					aria-valuenow={isDone ? orderedStages.length : currentIndex + 1}
					aria-valuetext={`Tahap ${isDone ? orderedStages.length : currentIndex + 1} dari ${orderedStages.length}: ${currentLabel}`}
					className="mt-6 grid h-2 gap-1"
					style={{
						gridTemplateColumns: `repeat(${orderedStages.length}, minmax(0, 1fr))`,
					}}
				>
					{orderedStages.map((stage, index) => {
						const isStageDone = isDone || index < currentIndex;
						const isStageCurrent = index === currentIndex && !isDone;

						return (
							<span
								key={stage}
								aria-hidden="true"
								className={`relative min-w-0 overflow-hidden rounded-sm ${isStageDone ? "bg-mist" : "bg-slate"}`}
							>
								{isStageCurrent ? (
									<span
										data-active-stage-segment
										className="absolute inset-y-0 left-0 w-1/3 bg-mist motion-safe:animate-scrape-progress motion-reduce:animate-none"
									/>
								) : null}
							</span>
						);
					})}
				</div>
			) : null}
			<div className="mt-6">
				{isFailed || isDone ? (
					<p aria-live="polite" className="mt-2.5 text-xs text-fog">
						{isFailed
							? errorMessage || defaultError
							: (stageDescriptions[status] ?? "Sedang memproses website…")}
					</p>
				) : (
					<ThoughtLine
						working
						bare
						label={currentLabel}
						doneLabel={currentLabel}
						presentation="rotating"
						activity={activity ?? null}
						rotationKey={activity ?? status}
						startedAt={activityStartedAt ?? stageStartedAt ?? undefined}
						fontSize="xs"
						className="mt-2.5"
						glyph={
							activity ? (
								<span
									aria-hidden="true"
									data-testid="scrape-active-indicator"
									className="inline-flex shrink-0 items-center gap-1.5"
								>
									<span className="size-1 rounded-full bg-fog motion-safe:animate-pulse motion-reduce:animate-none" />
									<span className="size-1 rounded-full bg-fog motion-safe:animate-pulse motion-reduce:animate-none animate-delay-200" />
									<span className="size-1 rounded-full bg-fog motion-safe:animate-pulse motion-reduce:animate-none animate-delay-400" />
								</span>
							) : undefined
						}
					/>
				)}
			</div>

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
									className="btn-primary mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-all hover:brightness-105 disabled:opacity-50"
								>
									{isRetrying ? (
										<Loader2
											size={14}
											className="motion-safe:animate-spin motion-reduce:animate-none"
										/>
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
									aria-current={isStageCurrent ? "step" : undefined}
									className={`flex items-center gap-2 font-mono text-xs ${
										isStageDone
											? "text-fog"
											: isStageCurrent
												? "font-semibold text-snow"
												: "text-fog/60"
									}`}
								>
									{isStageDone ? (
										<Check
											size={12}
											strokeWidth={3}
											aria-hidden="true"
											className="text-emerald-500/80"
										/>
									) : isStageCurrent ? (
										<Loader2
											size={12}
											className="motion-safe:animate-spin motion-reduce:animate-none"
										/>
									) : (
										<span
											aria-hidden="true"
											className="size-1.5 rounded-full bg-graphite"
										/>
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
