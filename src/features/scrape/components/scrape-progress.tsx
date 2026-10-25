import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
import { resolveScrapeActivity } from "@/features/scrape/utils/scrape-activity";
import { resolveScrapeErrorPresentation } from "@/features/scrape/utils/scrape-error-presentation";
import type { imageResultCounts } from "@/features/scrape/utils/scrape-images";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import { ScrapeErrorCard } from "./scrape-error-card";
import { ScrapeActivityLine } from "./scrape-progress-activity";
import { getScrapeStagesForMode, ScrapeStepper } from "./scrape-progress-steps";

export interface ScrapeProgressProps {
	status: ScrapeStatus;
	mode?: ScrapeMode;
	sourceUrl?: string;
	domain?: string;
	errorMessage?: string | null;
	errorDetail?: string | null;
	failedAtStage?: ScrapeStatus | null;
	retryAfterSeconds?: number | null;
	retryAfterExpiresAt?: string | null;
	isRetrying?: boolean;
	onRetry?: () => void;
	stageStartedAt?: string | null;
	activity?: string | null;
	activityStartedAt?: string | null;
	visitedPages?: number;
	discoveredPages?: number;
	completedPages?: number;
	skippedPages?: number;
	discoveredImages?: number;
	imageCounts?: ReturnType<typeof imageResultCounts>;
	failedResources?: number;
	/** Server-reported stall reason; never inferred on the client. */
	workerHealth?: string | null;
	// How many results are actually saved on disk, and how many resources failed.
	// Both come from persisted rows, so the failure card never invents a count.
	partialResults?: number;
	partialFailed?: number;
	imageDiscovery?:
		| "found"
		| "none"
		| "capture-failed"
		| "discovery-failed"
		| null;
	imageOutcome?: "complete" | "partial" | "empty" | "all-failed" | null;
}

const OPERATIONS: Record<ScrapeMode, string> = {
	design: "DESIGN.md",
	crawl: "Crawl Website",
	images: "Scrape Images",
	html: "Scrape HTML",
};

function resolveCounters(
	props: ScrapeProgressProps,
	mode: ScrapeMode,
): [string, number | undefined][] {
	if (mode === "crawl")
		return [
			["Ditemukan", props.discoveredPages],
			["Dikunjungi", props.visitedPages],
			["Selesai", props.completedPages],
			["Dilewati", props.skippedPages],
			["Gagal", props.failedResources],
		];
	if (mode === "images")
		return [
			["Ditemukan", props.imageCounts?.discovered ?? props.discoveredImages],
			["Tersimpan", props.imageCounts?.persisted],
			["Tautan terverifikasi", props.imageCounts?.linked],
			["Gagal", props.imageCounts?.failed],
			["Tertunda", props.imageCounts?.pending],
		];
	return [];
}

// Only material outcomes are explained. These notes describe what the run
// actually persisted, so they never guess at an internal cause.
function resolveImageNotes(props: ScrapeProgressProps): string[] {
	const notes: string[] = [];
	if (props.imageOutcome === "empty")
		notes.push(
			"Tidak ada gambar yang ditemukan. Halaman berhasil diperiksa, tetapi tidak ada gambar yang dapat diambil.",
		);
	if (props.imageOutcome === "partial")
		notes.push(
			"Sebagian gambar berhasil diproses. Jumlah byte tersimpan dan tautan terverifikasi ditampilkan terpisah. Alasan kegagalan tersedia di hasil gambar.",
		);
	if (
		props.imageDiscovery === "discovery-failed" ||
		props.imageDiscovery === "capture-failed"
	)
		notes.push(
			"Gambar belum dapat diperiksa. Akses ke website gagal sebelum proses pemeriksaan gambar selesai.",
		);
	return notes;
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
		errorDetail,
		failedAtStage,
		retryAfterSeconds,
		retryAfterExpiresAt,
		workerHealth,
	} = props;
	const stages = getScrapeStagesForMode(mode);
	const isFailed = status === "failed";
	const isDone = status === "completed";
	const operation = OPERATIONS[mode];
	const headerState = isFailed ? "Gagal" : isDone ? "Selesai" : "Berjalan";
	const resolvedActivity = resolveScrapeActivity({ activity, mode });
	const stalledMessage = isDone || isFailed ? null : (workerHealth ?? null);
	const startTimestamp = stageStartedAt ?? activityStartedAt ?? null;
	const visibleCounters = resolveCounters(props, mode).filter(
		([, value]) => typeof value === "number",
	);
	const imageNotes = resolveImageNotes(props);
	const presentation = resolveScrapeErrorPresentation({
		code: errorDetail ?? "UNEXPECTED_ERROR",
		message: errorMessage,
		retryAfterSeconds,
		retryAfterExpiresAt,
		partialResults: props.partialResults,
		partialFailed: props.partialFailed,
		partialKind:
			mode === "crawl" ? "pages" : mode === "html" ? "documents" : "images",
	});

	// One progress surface for every mode: identity, stage ladder, live activity
	// (or the failure card) and real counters share a single card so no mode can
	// grow a second, competing progress panel.
	return (
		<section
			aria-label={`Progres ${operation}`}
			data-scrape-progress={mode}
			className="min-w-0 rounded-xl border border-graphite bg-charcoal p-6"
		>
			<header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
				<div className="min-w-0">
					<p className="text-sm text-fog">{operation}</p>
					<h2 className="mt-1 truncate text-2xl font-bold text-snow">
						{domain ? displaySiteName(domain) : "Website"}
					</h2>
					{sourceUrl ? (
						<p className="mt-1 break-all font-mono text-xs text-fog">
							{sourceUrl}
						</p>
					) : null}
				</div>
				<p className="shrink-0 text-sm text-fog">
					<span aria-live="polite">{headerState}</span>
				</p>
			</header>

			<div className="mt-6 grid min-w-0 gap-6 border-t border-graphite pt-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
				{/* The stepper stays mounted on failure so the failed stage is
				    visible in the same progress hierarchy the user already saw. */}
				<ScrapeStepper
					mode={mode}
					stages={stages}
					status={status}
					failedAt={failedAtStage}
					stalled={Boolean(stalledMessage)}
				/>

				<div className="min-w-0 lg:border-l lg:border-graphite lg:pl-6">
					{isFailed ? (
						<ScrapeErrorCard
							{...presentation}
							mode={mode}
							isRetrying={isRetrying}
							onRetry={onRetry}
						/>
					) : (
						<>
							<p className="text-sm font-semibold text-snow">
								Aktivitas terbaru
							</p>
							<div data-activity-line className="mt-2">
								<ScrapeActivityLine
									status={status}
									activity={resolvedActivity}
									stageStartedAt={startTimestamp}
									stalledMessage={stalledMessage}
								/>
							</div>
						</>
					)}
				</div>
			</div>

			{visibleCounters.length > 0 && (
				<dl className="mt-6 grid grid-cols-2 gap-4 border-t border-graphite pt-5 sm:grid-cols-3 lg:grid-cols-5">
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

			{imageNotes.map((note) => (
				<p key={note} className="mt-4 text-sm text-fog">
					{note}
				</p>
			))}
		</section>
	);
}
