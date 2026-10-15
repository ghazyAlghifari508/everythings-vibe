import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ScrapeErrorCard } from "@/components/design/scrape-error-card";
import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
import { resolveScrapeErrorPresentation } from "@/lib/scrape-error-presentation";
import type { imageResultCounts } from "@/lib/scrape-images";
import { displaySiteName } from "@/lib/site-name";
import { cn } from "@/lib/utils";

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

const LABELS: Record<ScrapeStatus, string> = {
	queued: "Dalam antrean",
	capturing: "Mengambil halaman",
	extracting: "Memeriksa hasil ekstraksi",
	generating: "Menyusun DESIGN.md",
	saving: "Menyimpan hasil",
	completed: "Selesai",
	failed: "Proses terhenti",
};

const DESCRIPTIONS: Record<ScrapeStatus, string> = {
	queued: "Permintaan berhasil diterima",
	capturing: "Memproses halaman yang ditemukan",
	extracting: "Memeriksa konten yang tertangkap",
	generating: "Menyusun DESIGN.md dari evidence",
	saving: "Menyimpan hasil",
	completed: "Semua tahapan selesai",
	failed: "Tahap ini tidak dapat diselesaikan",
};

const OPERATIONS: Record<ScrapeMode, string> = {
	design: "DESIGN.md",
	crawl: "Crawl Website",
	images: "Scrape Images",
	html: "Scrape HTML",
};

export function getScrapeStagesForMode(mode: ScrapeMode): ScrapeStatus[] {
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
	if (mode === "images")
		return ["queued", "capturing", "extracting", "completed"];
	return ["queued", "capturing", "completed"];
}

type StepState = "done" | "active" | "pending" | "failed";

function StepMarker({ state }: { state: StepState }) {
	if (state === "done")
		return <Check size={14} aria-hidden className="text-mist" />;
	if (state === "active")
		return (
			<Loader2
				size={14}
				aria-hidden
				data-active-stage-spinner
				className="shrink-0 text-mist motion-safe:animate-spin motion-reduce:animate-none"
			/>
		);
	if (state === "failed")
		return (
			<AlertTriangle
				size={14}
				aria-hidden
				data-failed-stage-marker
				className="shrink-0 text-crimson"
			/>
		);
	return (
		<span aria-hidden className="size-1.5 rounded-full border border-slate" />
	);
}

export interface ScrapeStepperProps {
	stages: ScrapeStatus[];
	status: ScrapeStatus;
	failedAt?: ScrapeStatus | null;
	className?: string;
}

export function ScrapeStepper({
	stages,
	status,
	failedAt,
	className,
}: ScrapeStepperProps) {
	const isFailed = status === "failed";
	const isDone = status === "completed";
	const index = stages.indexOf(status);
	const failedIndex = failedAt ? stages.indexOf(failedAt) : -1;

	function stepState(i: number): StepState {
		if (isFailed) {
			if (failedIndex >= 0) {
				if (i < failedIndex) return "done";
				if (i === failedIndex) return "failed";
				return "pending";
			}
			return i === 0 ? "done" : "pending";
		}
		if (isDone) return "done";
		if (i < index) return "done";
		if (i === index) return "active";
		return "pending";
	}

	return (
		<ol
			data-stepper
			aria-label="Tahapan pemrosesan"
			className={cn("mt-6", className)}
		>
			{stages.map((stage, i) => {
				const state = stepState(i);
				const connectorState =
					state === "pending"
						? "pending"
						: state === "done"
							? "done"
							: "active";
				return (
					<li
						key={stage}
						data-step-state={state}
						aria-current={state === "active" ? "step" : undefined}
						className="relative flex items-start gap-3 pb-5 last:pb-0"
					>
						{i < stages.length - 1 ? (
							<span
								aria-hidden
								data-step-connector
								data-connector-state={connectorState}
								className={cn(
									"absolute top-5 bottom-1 left-2 w-px",
									connectorState === "pending" ? "bg-slate" : "bg-mist",
								)}
							/>
						) : null}
						<span className="relative z-10 flex size-4 shrink-0 items-center justify-center bg-charcoal">
							<StepMarker state={state} />
						</span>
						<div className="min-w-0">
							<p
								className={cn(
									"text-sm",
									state === "active" || state === "failed"
										? "font-semibold text-snow"
										: state === "done"
											? "text-fog"
											: "text-fog/70",
								)}
							>
								{LABELS[stage]}
								{state === "failed" ? " — Gagal" : null}
							</p>
							<p className="mt-0.5 text-xs text-fog">{DESCRIPTIONS[stage]}</p>
						</div>
					</li>
				);
			})}
		</ol>
	);
}

function ElapsedTimer({ start }: { start: string }) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(id);
	}, []);
	const startMs = Date.parse(start);
	if (!Number.isFinite(startMs)) return null;
	return (
		<span
			role="timer"
			aria-label="Waktu proses"
			className="font-mono text-xs text-fog tabular-nums"
		>
			{((now - startMs) / 1000).toFixed(1)}s
		</span>
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
						[
							"Ditemukan",
							props.imageCounts?.discovered ?? props.discoveredImages,
						],
						["Tersimpan", props.imageCounts?.persisted],
						["Tautan terverifikasi", props.imageCounts?.linked],
						["Gagal", props.imageCounts?.failed],
						["Tertunda", props.imageCounts?.pending],
					]
				: [];
	const visibleCounters = counters.filter(
		([, value]) => typeof value === "number",
	);
	const startTimestamp = activityStartedAt ?? stageStartedAt;
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
			<div data-layout={effectiveLayout} className="grid min-w-0 gap-6">
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
					{!isFailed && active && activityText ? (
						<div className="mt-5 flex min-w-0 items-baseline gap-2 border-t border-graphite pt-4">
							<output
								aria-live="polite"
								className="min-w-0 flex-1 break-words text-sm text-snow"
							>
								{activityText}
							</output>
							{startTimestamp ? <ElapsedTimer start={startTimestamp} /> : null}
						</div>
					) : null}
					{!isFailed && !activityText && status === "queued" ? (
						<p className="mt-5 break-words border-t border-graphite pt-4 text-sm text-fog">
							{props.workerHealth ?? "Menunggu giliran pemrosesan."}
						</p>
					) : null}
					{visibleCounters.length > 0 && (
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
					{props.imageOutcome === "empty" && (
						<p className="mt-6 text-sm text-fog">
							Tidak ada gambar yang ditemukan. Halaman berhasil diperiksa,
							tetapi tidak ada gambar yang dapat diambil.
						</p>
					)}
					{props.imageOutcome === "partial" && (
						<p className="mt-6 text-sm text-fog">
							Sebagian gambar berhasil diambil. Gambar yang tersedia tetap
							tersimpan; resource yang gagal diverifikasi beserta alasannya.
						</p>
					)}
					{(props.imageDiscovery === "discovery-failed" ||
						props.imageDiscovery === "capture-failed") && (
						<p className="mt-6 text-sm text-fog">
							Gambar belum dapat diperiksa. Akses ke website gagal sebelum
							proses pemeriksaan gambar selesai.
						</p>
					)}
				</section>
			</div>
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
