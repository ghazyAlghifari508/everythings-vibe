import { Check, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
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

export function ScrapeProgress(props: ScrapeProgressProps) {
	const {
		status,
		mode = "design",
		sourceUrl,
		domain,
		activity,
		stageStartedAt,
		isRetrying,
		onRetry,
		errorMessage,
	} = props;
	const stages: ScrapeStatus[] =
		mode === "design"
			? [
					"queued",
					"capturing",
					"extracting",
					"generating",
					"saving",
					"completed",
				]
			: mode === "html"
				? ["queued", "capturing", "extracting", "saving", "completed"]
				: ["queued", "capturing", "extracting", "completed"];
	const index = stages.indexOf(status);
	const active = status !== "completed" && status !== "failed";
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [active]);
	const timestamp = props.activityStartedAt ?? stageStartedAt;
	const start = timestamp ? Date.parse(timestamp) : NaN;
	const elapsed = Number.isFinite(start)
		? Math.max(0, Math.floor((now - start) / 1000))
		: null;
	const operation =
		mode === "design"
			? "DESIGN.md"
			: mode === "crawl"
				? "Crawl Website"
				: mode === "images"
					? "Scrape Images"
					: "Scrape HTML";
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
					<p className="mt-2 break-words text-sm text-fog">
						{status === "failed"
							? "Pemrosesan berhenti. Lihat alasan dan opsi pemulihan di workspace."
							: activity || LABELS[status]}
					</p>
					{active && errorMessage && (
						<p role="alert" className="mt-3 text-sm text-fog">
							{errorMessage}
						</p>
					)}
					{elapsed !== null && active && (
						<p role="timer" className="mt-3 font-mono text-xs text-fog">
							{elapsed}s pada tahap ini
						</p>
					)}
					{status === "queued" && (
						<p className="mt-3 text-sm text-fog">
							{props.workerHealth ??
								"Job menunggu worker. Belum ada sinyal pemrosesan."}
						</p>
					)}
				</div>
				{counters.some(([, value]) => typeof value === "number") && (
					<dl className="mt-6 grid grid-cols-2 gap-4">
						{counters
							.filter(([, value]) => typeof value === "number")
							.map(([label, value]) => (
								<div key={String(label)}>
									<dt className="text-xs text-fog">{label}</dt>
									<dd className="mt-1 font-mono text-xl text-snow">{value}</dd>
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
					<output className="text-sm text-fog">{LABELS[status]}</output>
				</div>
				{status === "failed" ? (
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
							{stages.map((stage, i) => (
								<span
									key={stage}
									className={`h-1.5 min-w-0 flex-1 rounded-sm ${i <= index ? "bg-mist" : "bg-slate"}`}
								/>
							))}
						</div>
						<ol className="mt-6 space-y-5" aria-label="Tahapan pemrosesan">
							{stages.map((stage, i) => (
								<li
									key={stage}
									aria-current={stage === status ? "step" : undefined}
									className="flex items-start gap-3"
								>
									<span className="mt-1 flex size-4 shrink-0 items-center justify-center">
										{i < index || status === "completed" ? (
											<Check size={14} aria-hidden />
										) : (
											<span
												className={`size-2 rounded-full ${stage === status ? "bg-mist motion-safe:animate-pulse" : "bg-graphite"}`}
											/>
										)}
									</span>
									<div className="min-w-0">
										<p
											className={`text-sm ${stage === status ? "font-semibold text-snow" : "text-fog"}`}
										>
											{LABELS[stage]}
										</p>
										{stage === status && (
											<p className="mt-1 break-all text-xs leading-5 text-fog">
												{activity ||
													(status === "queued"
														? "Menunggu worker mengambil job."
														: "Tahap ini sedang berlangsung.")}
											</p>
										)}
									</div>
								</li>
							))}
						</ol>
					</>
				)}
			</section>
		</div>
	);
}
