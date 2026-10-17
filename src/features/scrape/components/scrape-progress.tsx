import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
import { resolveScrapeErrorPresentation } from "@/features/scrape/utils/scrape-error-presentation";
import type { imageResultCounts } from "@/features/scrape/utils/scrape-images";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import { ScrapeErrorCard } from "./scrape-error-card";
import { ElapsedTimer } from "./scrape-progress-elapsed";
import { ScrapeImagesProgress } from "./scrape-progress-images";
import {
	getScrapeStagesForMode,
	LABELS,
	ScrapeStepper,
} from "./scrape-progress-steps";

export {
	getScrapeStagesForMode,
	ScrapeStepper,
	type ScrapeStepperProps,
} from "./scrape-progress-steps";

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
	processedImages?: number;
	discoveredImages?: number;
	savedImages?: number;
	imageCounts?: ReturnType<typeof imageResultCounts>;
	failedResources?: number;
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
	layout?: "two-panel" | "single";
}

const OPERATIONS: Record<ScrapeMode, string> = {
	design: "DESIGN.md",
	crawl: "Crawl Website",
	images: "Scrape Images",
	html: "Scrape HTML",
};

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
		layout = "two-panel",
	} = props;
	const stages = getScrapeStagesForMode(mode);
	const isFailed = status === "failed";
	const isDone = status === "completed";
	const active = !isDone && !isFailed;
	const operation = OPERATIONS[mode];
	const headerState = isFailed ? "Gagal" : isDone ? "Selesai" : "Berjalan";
	const effectiveLayout = mode === "images" ? "single" : layout;

	const counters: [string, number | undefined][] =
		mode === "crawl"
			? [
					["Ditemukan", props.discoveredPages],
					["Dikunjungi", props.visitedPages],
					["Selesai", props.completedPages],
					["Dilewati", props.skippedPages],
					["Gagal", props.failedResources],
				]
			: [];
	const visibleCounters = counters.filter(
		([, value]) => typeof value === "number",
	);
	const startTimestamp = activityStartedAt ?? stageStartedAt ?? null;
	const activityText = activity ?? null;
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

	if (mode === "images") {
		return (
			<ScrapeImagesProgress
				progress={props}
				stages={stages}
				operation={operation}
				layout={effectiveLayout}
				headerState={headerState}
				activityText={activityText}
				startTimestamp={startTimestamp}
				presentation={presentation}
			/>
		);
	}

	return (
		<div
			data-layout={layout}
			className={
				layout === "single"
					? "grid min-w-0 gap-6"
					: "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]"
			}
		>
			<div className="min-w-0">
				<p className="text-sm text-fog">{operation}</p>
				<h2 className="mt-1 text-2xl font-bold text-snow">
					{domain ? displaySiteName(domain) : "Website"}
				</h2>
				<p className="mt-2 break-all font-mono text-xs text-fog">{sourceUrl}</p>

				<div className="mt-6 border-t border-graphite pt-5">
					<p className="text-sm font-semibold text-snow">Aktivitas terbaru</p>
					{isFailed ? (
						<p className="mt-2 break-words text-sm text-fog">
							Pemrosesan berhenti. Lihat alasan dan opsi pemulihan di panel
							progres.
						</p>
					) : active && activityText ? (
						<div className="mt-2 flex min-w-0 items-baseline gap-2">
							<output
								aria-live="polite"
								className="min-w-0 flex-1 break-words text-sm text-snow"
							>
								{activityText}
							</output>
							{startTimestamp ? <ElapsedTimer start={startTimestamp} /> : null}
						</div>
					) : (
						<p className="mt-2 break-words text-sm text-fog">
							{status === "queued"
								? (props.workerHealth ?? "Menunggu giliran pemrosesan.")
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
					<p className="shrink-0 text-sm text-fog">
						<span aria-live="polite">{headerState}</span>
					</p>
				</div>

				{/* The stepper stays mounted on failure so the failed stage is
				    visible in the same progress hierarchy the user already saw. */}
				<ScrapeStepper
					stages={stages}
					status={status}
					failedAt={failedAtStage}
				/>

				{isFailed ? (
					<div className="mt-5 border-t border-graphite pt-5">
						<ScrapeErrorCard
							{...presentation}
							mode={mode}
							isRetrying={isRetrying}
							onRetry={onRetry}
						/>
					</div>
				) : null}
			</section>
		</div>
	);
}
