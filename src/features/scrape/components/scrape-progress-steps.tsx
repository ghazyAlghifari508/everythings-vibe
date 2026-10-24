import {
	Alert02Icon,
	Loading02Icon,
	PauseCircleIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

export const LABELS: Record<ScrapeStatus, string> = {
	queued: "Dalam antrean",
	capturing: "Mengambil halaman",
	extracting: "Memeriksa hasil",
	generating: "Menyusun DESIGN.md",
	saving: "Menyimpan hasil",
	completed: "Selesai",
	failed: "Proses terhenti",
};

// Descriptions are scoped per mode so a stage never explains work that this
// mode does not perform.
const DESCRIPTIONS: Record<
	ScrapeMode,
	Partial<Record<ScrapeStatus, string>>
> = {
	design: {
		queued: "Permintaan diterima dan menunggu diproses",
		capturing: "Memuat halaman dan mengambil tampilan",
		extracting: "Memeriksa gaya dan komponen halaman",
		generating: "Menyusun DESIGN.md dari hasil pengukuran",
		saving: "Menyimpan DESIGN.md beserta hasil pendukung",
		completed: "DESIGN.md siap dibuka",
	},
	html: {
		queued: "Permintaan diterima dan menunggu diproses",
		capturing: "Memuat halaman dan menyalin struktur",
		extracting: "Membaca stylesheet dan aset halaman",
		saving: "Menyimpan HTML dan resource pendukung",
		completed: "Hasil HTML siap dibuka",
	},
	images: {
		queued: "Permintaan diterima dan menunggu diproses",
		capturing: "Memuat halaman dan mencari gambar",
		extracting: "Memeriksa dan menyimpan gambar",
		completed: "Gambar yang tersimpan siap dibuka",
	},
	crawl: {
		queued: "Permintaan diterima dan menunggu diproses",
		capturing: "Membuka halaman dan mengikuti tautan",
		completed: "Daftar halaman siap dibuka",
	},
};

const FAILED_DESCRIPTION = "Tahap ini tidak dapat diselesaikan";

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

// `waiting` is the queue stage: it is current, but no worker has started it, so
// it must not pretend to be running with a spinner.
type StepState = "done" | "active" | "waiting" | "pending" | "failed";

function StepMarker({
	state,
	stalled,
}: {
	state: StepState;
	stalled: boolean;
}) {
	if (state === "done")
		return (
			<Icon icon={Tick01Icon} size={14} aria-hidden className="text-mist" />
		);
	if (state === "active") {
		if (stalled)
			return (
				<Icon
					icon={PauseCircleIcon}
					size={14}
					aria-hidden
					data-stalled-stage-marker
					className="shrink-0 text-fog"
				/>
			);
		return (
			<Icon
				icon={Loading02Icon}
				size={14}
				aria-hidden
				data-active-stage-spinner
				className="shrink-0 text-mist motion-safe:animate-spin motion-reduce:animate-none"
			/>
		);
	}
	if (state === "failed")
		return (
			<Icon
				icon={Alert02Icon}
				size={14}
				aria-hidden
				data-failed-stage-marker
				className="shrink-0 text-crimson"
			/>
		);
	if (state === "waiting")
		return (
			<span
				aria-hidden
				data-waiting-stage-marker
				className="size-2 rounded-full border border-mist"
			/>
		);
	return (
		<span aria-hidden className="size-1.5 rounded-full border border-slate" />
	);
}

export interface ScrapeStepperProps {
	stages: ScrapeStatus[];
	status: ScrapeStatus;
	mode?: ScrapeMode;
	failedAt?: ScrapeStatus | null;
	/** Server reports no worker progress for the current stage. */
	stalled?: boolean;
	className?: string;
}

export function ScrapeStepper({
	stages,
	status,
	mode = "design",
	failedAt,
	stalled = false,
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
		if (status === "queued" || index < 0)
			return i === 0 ? "waiting" : "pending";
		if (i < index) return "done";
		if (i === index) return "active";
		return "pending";
	}

	return (
		<ol
			data-stepper
			aria-label="Tahapan pemrosesan"
			className={cn("flex flex-col", className)}
		>
			{stages.map((stage, i) => {
				const state = stepState(i);
				const connectorState =
					state === "done" ? "done" : state === "active" ? "active" : "pending";
				const description =
					state === "failed" ? FAILED_DESCRIPTION : DESCRIPTIONS[mode][stage];
				return (
					<li
						key={stage}
						data-step-state={state}
						data-stalled={stalled && state === "active" ? "" : undefined}
						aria-current={
							state === "active" || state === "waiting" ? "step" : undefined
						}
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
							<StepMarker state={state} stalled={stalled} />
						</span>
						<div className="min-w-0">
							<p
								className={cn(
									"text-sm",
									state === "active" || state === "failed"
										? "font-semibold text-snow"
										: state === "waiting"
											? "font-medium text-snow"
											: state === "done"
												? "text-fog"
												: "text-fog/70",
								)}
							>
								{LABELS[stage]}
							</p>
							{state === "pending" || !description ? null : (
								<p data-step-description className="mt-0.5 text-xs text-fog">
									{description}
								</p>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
