import type { ScrapeStatus } from "@/db/schema";
import type { resolveScrapeErrorPresentation } from "@/features/scrape/utils/scrape-error-presentation";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import { ScrapeErrorCard } from "./scrape-error-card";
import type { ScrapeProgressProps } from "./scrape-progress";
import { ScrapeActivityLine } from "./scrape-progress-activity";
import { LABELS, ScrapeStepper } from "./scrape-progress-steps";

// Images keep their own single-column presentation: identity, then one card
// whose header reports image status, the image stage ladder, live counters and
// the honest notes about empty/partial/failed discovery.
export function ScrapeImagesProgress({
	progress,
	stages,
	operation,
	headerState,
	activityText,
	stageStartedAt,
	activityStartedAt,
	stalledMessage,
	presentation,
}: {
	progress: ScrapeProgressProps;
	stages: ScrapeStatus[];
	operation: string;
	headerState: string;
	activityText: string | null;
	stageStartedAt: string | null;
	activityStartedAt: string | null;
	stalledMessage: string | null;
	presentation: ReturnType<typeof resolveScrapeErrorPresentation>;
}) {
	const {
		status,
		domain,
		sourceUrl,
		imageCounts,
		discoveredImages,
		failedAtStage,
		isRetrying,
		onRetry,
		imageOutcome,
		imageDiscovery,
	} = progress;
	const isFailed = status === "failed";
	const active = status !== "completed" && !isFailed;
	const counters: [string, number | undefined][] = [
		["Ditemukan", imageCounts?.discovered ?? discoveredImages],
		["Tersimpan", imageCounts?.persisted],
		["Tautan terverifikasi", imageCounts?.linked],
		["Gagal", imageCounts?.failed],
		["Tertunda", imageCounts?.pending],
	];
	const visibleCounters = counters.filter(
		([, value]) => typeof value === "number",
	);

	return (
		<div data-layout="single" className="grid min-w-0 gap-6">
			<div className="min-w-0">
				<p className="text-sm text-fog">{operation}</p>
				<h2 className="mt-1 text-2xl font-bold text-snow">
					{domain ? displaySiteName(domain) : "Website"}
				</h2>
				{sourceUrl ? (
					<p className="mt-2 break-all font-mono text-xs text-fog">
						{sourceUrl}
					</p>
				) : null}
			</div>
			<section
				aria-label={`Progres ${operation}`}
				data-scrape-progress="images"
				className="min-w-0 rounded-xl border border-graphite bg-charcoal p-6"
			>
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-lg font-semibold text-snow">
						Status:{" "}
						{isFailed ? "Gagal" : active ? "Sedang diproses" : "Selesai"}
					</h3>
					<p className="shrink-0 text-sm text-fog">
						<span aria-live="polite">{headerState}</span>
					</p>
				</div>
				{/* The stepper stays mounted on failure so the failed stage is
				    visible in the same progress hierarchy the user already saw. */}
				<ScrapeStepper
					mode="images"
					stages={stages}
					status={status}
					failedAt={failedAtStage}
					stalled={Boolean(stalledMessage)}
				/>
				{isFailed ? (
					<div className="mt-5 border-t border-graphite pt-5">
						<ScrapeErrorCard
							{...presentation}
							mode="images"
							isRetrying={isRetrying}
							onRetry={onRetry}
						/>
					</div>
				) : null}
				{!isFailed && active ? (
					<ScrapeActivityLine
						className="mt-5 border-t border-graphite pt-4"
						status={status}
						activity={activityText}
						fallbackLabel={LABELS[status]}
						stageStartedAt={stageStartedAt}
						activityStartedAt={activityStartedAt}
						stalledMessage={stalledMessage}
					/>
				) : null}
				{visibleCounters.length > 0 && !isFailed && (
					<dl className="mt-6 grid grid-cols-2 gap-4 border-t border-graphite pt-5 sm:grid-cols-4">
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
				{imageOutcome === "empty" && (
					<p className="mt-6 text-sm text-fog">
						Tidak ada gambar yang ditemukan. Halaman berhasil diperiksa, tetapi
						tidak ada gambar yang dapat diambil.
					</p>
				)}
				{imageOutcome === "partial" && (
					<p className="mt-6 text-sm text-fog">
						Sebagian gambar berhasil disimpan. Rincian kegagalan tersedia di
						hasil pengambilan gambar.
					</p>
				)}
				{(imageDiscovery === "discovery-failed" ||
					imageDiscovery === "capture-failed") && (
					<p className="mt-6 text-sm text-fog">
						Gambar belum dapat diperiksa. Akses ke website gagal sebelum proses
						pemeriksaan gambar selesai.
					</p>
				)}
			</section>
		</div>
	);
}
