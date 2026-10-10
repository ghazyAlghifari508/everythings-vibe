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

	if (mode !== "html") {
		return (
			<DesignProgressWorkspace
				status={status}
				sourceUrl={sourceUrl}
				siteName={siteName}
				errorMessage={errorMessage}
				isRetrying={isRetrying}
				onRetry={onRetry}
				stageStartedAt={stageStartedAt}
				activity={activity}
				activityStartedAt={activityStartedAt}
				orderedStages={orderedStages}
				stageLabels={stageLabels}
				stageDescriptions={stageDescriptions}
				currentIndex={currentIndex}
				currentLabel={currentLabel}
				defaultError={defaultError}
			/>
		);
	}

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
											aria-hidden="true"
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

function canonicalSourceHref(sourceUrl?: string): string | null {
	if (!sourceUrl) return null;
	try {
		const parsed = new URL(sourceUrl);
		if (parsed.protocol === "http:" || parsed.protocol === "https:")
			return sourceUrl;
		return null;
	} catch {
		return null;
	}
}

interface DesignProgressWorkspaceProps {
	status: ScrapeStatus;
	sourceUrl?: string;
	siteName: string;
	errorMessage?: string | null;
	isRetrying?: boolean;
	onRetry?: () => void;
	stageStartedAt?: string | null;
	activity?: string | null;
	activityStartedAt?: string | null;
	orderedStages: ScrapeStatus[];
	stageLabels: Record<string, string>;
	stageDescriptions: Record<ScrapeStatus, string>;
	currentIndex: number;
	currentLabel: string;
	defaultError: string;
}

function DesignProgressWorkspace({
	status,
	sourceUrl,
	siteName,
	errorMessage,
	isRetrying = false,
	onRetry,
	stageStartedAt,
	activity,
	activityStartedAt,
	orderedStages,
	stageLabels,
	stageDescriptions,
	currentIndex,
	currentLabel,
	defaultError,
}: DesignProgressWorkspaceProps) {
	const isFailed = status === "failed";
	const isDone = status === "completed";
	const canonicalHref = canonicalSourceHref(sourceUrl);
	return (
		<div className="grid w-full min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:gap-8">
			<div className="min-w-0">
				<p className="font-mono text-xs uppercase tracking-wider text-fog">
					Style Inspector
				</p>
				<h2 className="mt-1 text-2xl font-bold tracking-tight text-snow">
					{siteName}
				</h2>
				{canonicalHref ? (
					<p className="mt-1 min-w-0 font-mono text-xs text-fog/70">
						<a
							href={canonicalHref}
							target="_blank"
							rel="noreferrer noopener"
							className="text-indigo underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							style={{ overflowWrap: "anywhere" }}
						>
							{canonicalHref}
						</a>
					</p>
				) : sourceUrl ? (
					<p
						className="mt-1 min-w-0 font-mono text-xs text-fog/70"
						style={{ overflowWrap: "anywhere" }}
					>
						{sourceUrl}
					</p>
				) : null}
				<div className="mt-6 border-t border-graphite pt-6">
					<p className="font-mono text-xs uppercase tracking-wider text-fog">
						Aktivitas
					</p>
					{!isDone && !isFailed && activity ? (
						<ThoughtLine
							working
							bare
							label={currentLabel}
							doneLabel={currentLabel}
							presentation="rotating"
							activity={activity}
							rotationKey={activity}
							startedAt={activityStartedAt ?? stageStartedAt ?? undefined}
							fontSize="xs"
							className="mt-3"
							glyph={
								<span
									aria-hidden="true"
									data-testid="scrape-active-indicator"
									className="inline-flex shrink-0 items-center gap-1.5"
								>
									<span className="size-1 rounded-full bg-fog motion-safe:animate-pulse motion-reduce:animate-none" />
									<span className="size-1 rounded-full bg-fog motion-safe:animate-pulse motion-reduce:animate-none animate-delay-200" />
									<span className="size-1 rounded-full bg-fog motion-safe:animate-pulse motion-reduce:animate-none animate-delay-400" />
								</span>
							}
						/>
					) : (
						<p aria-live="polite" className="mt-3 text-xs text-fog">
							{isFailed
								? (errorMessage ?? defaultError)
								: isDone
									? (stageDescriptions[status] ?? "Sedang memproses website…")
									: (stageDescriptions[status] ?? currentLabel)}
						</p>
					)}
				</div>
			</div>
			<section
				aria-label="Progres DESIGN.md"
				className="min-w-0 rounded-xl border border-graphite bg-charcoal p-6"
			>
				<div className="flex items-center justify-between gap-2">
					<span className="font-mono text-xs uppercase tracking-wider text-fog">
						Design.md
					</span>
					<p className="flex items-center gap-2 font-mono text-xs font-semibold text-snow">
						{!isDone && !isFailed ? (
							<Loader2
								size={14}
								aria-hidden="true"
								className="text-mist motion-safe:animate-spin motion-reduce:animate-none"
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
						className="mt-4 grid h-2 gap-1"
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
				{!isFailed && !isDone ? (
					<p className="mt-3 text-xs text-fog">
						{stageDescriptions[status] ?? "Sedang memproses website…"}
					</p>
				) : null}
				{isFailed ? (
					<div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
						<div className="flex items-start gap-3">
							<AlertCircle
								size={18}
								className="mt-0.5 shrink-0 text-rose-400"
								aria-hidden="true"
							/>
							<div className="flex-1">
								<p className="text-sm font-semibold text-rose-200">
									{errorMessage ?? defaultError}
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
												aria-hidden="true"
												className="motion-safe:animate-spin motion-reduce:animate-none"
											/>
										) : (
											<RotateCcw size={14} aria-hidden="true" />
										)}
										<span>Coba lagi</span>
									</button>
								) : null}
							</div>
						</div>
					</div>
				) : (
					<ol aria-label="Tahapan DESIGN.md" className="mt-6">
						{orderedStages.map((s, idx) => {
							const isStageDone =
								isDone || (currentIndex >= 0 && idx < currentIndex);
							const isStageCurrent = currentIndex === idx && !isDone;
							return (
								<li
									key={s}
									aria-current={isStageCurrent ? "step" : undefined}
									className="relative flex gap-3 pb-5 last:pb-0"
								>
									{idx < orderedStages.length - 1 ? (
										<span
											aria-hidden="true"
											className="absolute top-5 left-[5px] h-[calc(100%-1.25rem)] w-px bg-graphite"
										/>
									) : null}
									<span className="relative z-10 mt-0.5 flex size-3 shrink-0 items-center justify-center">
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
												aria-hidden="true"
												className="text-snow motion-safe:animate-spin motion-reduce:animate-none"
											/>
										) : (
											<span
												aria-hidden="true"
												className="size-1.5 rounded-full bg-graphite"
											/>
										)}
									</span>
									<span className="min-w-0 flex-1">
										<span
											className={`block truncate font-mono text-xs ${
												isStageDone
													? "text-fog"
													: isStageCurrent
														? "font-semibold text-snow"
														: "text-fog/60"
											}`}
										>
											{stageLabels[s] ?? s}
										</span>
										{isStageCurrent ? (
											<span className="mt-0.5 block text-xs leading-5 text-fog">
												{stageDescriptions[s] ?? ""}
											</span>
										) : null}
									</span>
								</li>
							);
						})}
					</ol>
				)}
			</section>
		</div>
	);
}
