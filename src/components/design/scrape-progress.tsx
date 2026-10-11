import { Check, Loader2, RotateCcw } from "lucide-react";
import { ThoughtLine } from "@/components/ui/thought-line";
import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
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
	visitedPages?: number;
	discoveredPages?: number;
	completedPages?: number;
	skippedPages?: number;
	processedImages?: number;
	discoveredImages?: number;
	savedImages?: number;
	failedResources?: number;
	workerHealth?: string | null;
	partialResults?: number;
}

const LABELS: Record<ScrapeStatus, string> = {
	queued: "Dalam antrean",
	capturing: "Mengambil halaman",
	extracting: "Memeriksa hasil ekstraksi",
	generating: "Menyusun DESIGN.md",
	saving: "Menyimpan hasil",
	completed: "Selesai",
	failed: "Proses terhenti",
};

const OPERATIONS: Record<ScrapeMode, string> = {
	design: "DESIGN.md",
	crawl: "Crawl Website",
	images: "Scrape Images",
	html: "Scrape HTML",
};

function stagesFor(mode: ScrapeMode): ScrapeStatus[] {
	if (mode === "design")
		return [
			"queued",
			"capturing",
			"extracting",
			"generating",
			"saving",
			"completed",
		];
	if (mode === "html")
		return ["queued", "capturing", "extracting", "saving", "completed"];
	return ["queued", "capturing", "extracting", "completed"];
}

// A live stage is shown by a real spinning indicator; completed stages keep a
// check mark and upcoming stages stay neutral. The number of finished stages
// comes from the persisted status, never from an estimate.
function StageMarker({ done, current }: { done: boolean; current: boolean }) {
	if (done && !current)
		return <Check size={14} aria-hidden className="text-mist" />;
	if (current)
		return (
			<Loader2
				size={14}
				aria-hidden
				data-active-stage-marker
				className="text-mist motion-safe:animate-spin motion-reduce:animate-none"
			/>
		);
	return (
		<span aria-hidden className="size-1.5 rounded-full border border-slate" />
	);
}

export function ScrapeProgress(props: ScrapeProgressProps) {
	const {
		status,
		mode = "design",
		sourceUrl,
		domain,
		activity,
		stageStartedAt,
		activityStartedAt,
		isRetrying,
		onRetry,
		errorMessage,
	} = props;
	const stages = stagesFor(mode);
	const index = stages.indexOf(status);
	const isFailed = status === "failed";
	const isDone = status === "completed";
	const active = !isDone && !isFailed;
	const operation = OPERATIONS[mode];

	const counters =
		mode === "crawl"
			? [
					["Ditemukan", props.discoveredPages],
					["Dikunjungi", props.visitedPages],
					["Selesai", props.completedPages],
					["Dilewati", props.skippedPages],
					["Gagal", props.failedResources],
				]
			: mode === "images"
				? [
						["Ditemukan", props.discoveredImages],
						["Diproses", props.processedImages],
						["Tersimpan", props.savedImages],
						["Gagal", props.failedResources],
					]
				: [];
	const visibleCounters = counters.filter(
		([, value]) => typeof value === "number",
	);
	const startTimestamp = activityStartedAt ?? stageStartedAt;
	// While queued no worker has touched the job, so the activity slot states
	// that honestly instead of animating as if analysis had started.
	const activityText = activity ?? null;

	return (
		<div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
			<div className="min-w-0">
				<p className="text-sm text-fog">{operation}</p>
				<h2 className="mt-1 text-2xl font-bold text-snow">
					{domain ? displaySiteName(domain) : "Website"}
				</h2>
				<p className="mt-2 break-all font-mono text-xs text-fog">{sourceUrl}</p>

				<div className="mt-6 border-t border-graphite pt-5">
					<p className="text-sm font-semibold text-snow">
						Aktivitas pemrosesan
					</p>
					{isFailed ? (
						<p className="mt-2 break-words text-sm text-fog">
							Pemrosesan berhenti. Lihat alasan dan opsi pemulihan di panel
							progres.
						</p>
					) : activityText ? (
						<ThoughtLine
							working={active}
							bare
							label={LABELS[status]}
							doneLabel={LABELS[status]}
							presentation="rotating"
							activity={activityText}
							rotationKey={activityText}
							startedAt={startTimestamp ?? undefined}
							showTimer={active}
							fontSize="xs"
							className="mt-2"
							glyph={
								<Loader2
									size={14}
									aria-hidden
									className="shrink-0 text-mist motion-safe:animate-spin motion-reduce:animate-none"
								/>
							}
						/>
					) : (
						<p className="mt-2 break-words text-sm text-fog">
							{status === "queued"
								? (props.workerHealth ??
									"Job menunggu worker. Belum ada sinyal pemrosesan.")
								: LABELS[status]}
						</p>
					)}
				</div>

				{visibleCounters.length > 0 && (
					<dl className="mt-6 grid grid-cols-2 gap-4">
						{visibleCounters.map(([label, value]) => (
							<div key={String(label)}>
								<dt className="text-xs text-fog">{label}</dt>
								<dd className="mt-1 font-mono text-xl text-snow tabular-nums">
									{value}
								</dd>
							</div>
						))}
					</dl>
				)}
			</div>

			<section
				aria-label={`Progres ${operation}`}
				className="min-w-0 rounded-xl border border-graphite bg-charcoal p-6"
			>
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-lg font-semibold text-snow">{operation}</h3>
					<p className="flex shrink-0 items-center gap-2 text-sm text-fog">
						{active ? (
							<Loader2
								size={14}
								aria-hidden
								className="text-mist motion-safe:animate-spin motion-reduce:animate-none"
							/>
						) : null}
						<span aria-live="polite">{LABELS[status]}</span>
					</p>
				</div>

				{isFailed ? (
					<div className="mt-5">
						<p role="alert" className="text-sm text-snow">
							{errorMessage || "Ekstraksi tidak dapat diselesaikan."}
						</p>
						<p className="mt-2 text-sm text-fog">
							{props.partialResults
								? `${props.partialResults} hasil tersimpan tetap tersedia di bawah.`
								: "Belum ada hasil yang berhasil disimpan."}
						</p>
						{onRetry && (
							<button
								type="button"
								disabled={isRetrying}
								onClick={onRetry}
								className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite px-4 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
							>
								<RotateCcw size={16} aria-hidden />
								{isRetrying ? "Mengantrekan ulang" : "Coba lagi"}
							</button>
						)}
					</div>
				) : (
					<>
						<div aria-hidden="true" className="mt-5 flex gap-1">
							{stages.map((stage, i) => {
								const stageDone = isDone || i < index;
								const stageCurrent = !isDone && i === index;
								return (
									<span
										key={stage}
										className={`relative min-w-0 flex-1 overflow-hidden rounded-sm ${
											stageDone ? "bg-mist" : "bg-slate"
										}`}
									>
										{stageCurrent ? (
											<span
												data-active-stage-segment
												className="absolute inset-y-0 left-0 w-1/3 bg-mist motion-safe:animate-scrape-progress motion-reduce:animate-none"
											/>
										) : null}
									</span>
								);
							})}
						</div>

						<ol className="mt-6 space-y-5" aria-label="Tahapan pemrosesan">
							{stages.map((stage, i) => {
								const stageDone = isDone || i < index;
								const stageCurrent = !isDone && i === index;
								return (
									<li
										key={stage}
										aria-current={stageCurrent ? "step" : undefined}
										className="flex items-start gap-3"
									>
										<span className="mt-1 flex size-4 shrink-0 items-center justify-center">
											<StageMarker done={stageDone} current={stageCurrent} />
										</span>
										<div className="min-w-0">
											<p
												className={`text-sm ${
													stageCurrent
														? "font-semibold text-snow"
														: stageDone
															? "text-fog"
															: "text-fog/70"
												}`}
											>
												{LABELS[stage]}
											</p>
											{stageCurrent && (
												<p className="mt-1 break-all text-xs leading-5 text-fog">
													{activityText ??
														(status === "queued"
															? "Menunggu worker mengambil job."
															: "Tahap ini sedang berlangsung.")}
												</p>
											)}
										</div>
									</li>
								);
							})}
						</ol>
					</>
				)}
			</section>
		</div>
	);
}
