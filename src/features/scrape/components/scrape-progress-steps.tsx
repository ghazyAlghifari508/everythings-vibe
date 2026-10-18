import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

export const LABELS: Record<ScrapeStatus, string> = {
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
