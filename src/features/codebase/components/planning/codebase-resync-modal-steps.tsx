"use client";

import {
	AlertCircleIcon,
	Copy01Icon,
	RefreshIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import type {
	SyncPromptPayload,
	SyncStageView,
	SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { SyncStageList } from "../workspace/sync-stage-list";

export type StepState = "pending" | "active" | "done" | "failed";

export function StepIndicator({
	step,
	state,
}: {
	step: number;
	state: StepState;
}) {
	if (state === "done") {
		return (
			<span
				data-step-state="done"
				className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-400"
			>
				<Icon
					icon={Tick01Icon}
					size={12}
					className="shrink-0"
					aria-hidden="true"
				/>
				<span className="sr-only">Selesai</span>
			</span>
		);
	}
	if (state === "active") {
		return (
			<span
				data-step-state="active"
				className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-500/40 bg-blue-500/10 font-mono text-xs text-blue-400"
			>
				<Spinner size={12} className="text-blue-400" />
				<span className="sr-only">Aktif</span>
			</span>
		);
	}
	if (state === "failed") {
		return (
			<span
				data-step-state="failed"
				className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-crimson/40 bg-crimson/10 font-mono text-xs text-crimson"
			>
				<Icon
					icon={AlertCircleIcon}
					size={12}
					className="shrink-0"
					aria-hidden="true"
				/>
				<span className="sr-only">Gagal</span>
			</span>
		);
	}
	return (
		<span
			data-step-state="pending"
			className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist"
		>
			{step}
		</span>
	);
}

export function ResyncStep1Prompt({
	stepState,
	payload,
	isStarting,
	promptText,
	copyError,
	copied,
	onRequestNewToken,
	onCopy,
}: {
	stepState: StepState;
	payload: SyncPromptPayload | null;
	isStarting: boolean;
	promptText: string;
	copyError: string | null;
	copied: boolean;
	onRequestNewToken?: () => void;
	onCopy: () => void;
}) {
	return (
		<div
			data-testid="resync-step-1"
			data-step-state={stepState}
			className="flex items-start gap-3.5"
		>
			<StepIndicator step={1} state={stepState} />
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<h3 className="text-xs font-semibold text-mist">
					Salin instruksi sync ulang
				</h3>
				<div className="relative rounded-lg border border-graphite bg-onyx p-3 sm:p-4">
					{payload ? (
						<>
							<div className="mb-1 text-[11px] font-medium text-fog">
								Prompt sync ulang
							</div>
							<div
								data-testid="resync-prompt-content"
								className="hide-scrollbar max-h-40 select-all overflow-x-auto overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-snow"
							>
								{promptText}
							</div>
							{copyError && (
								<p className="mt-2 font-sans text-[11px] text-crimson">
									{copyError}
								</p>
							)}
						</>
					) : isStarting ? (
						<div className="flex items-center justify-center gap-2 py-8 font-sans text-xs text-fog">
							<Spinner size={14} className="text-blue-400" />
							<span>Menyiapkan sesi sync...</span>
						</div>
					) : (
						<div className="flex flex-col items-center justify-center gap-3 py-6 text-center font-sans">
							<p className="text-xs text-fog">
								Token sync sudah kedaluwarsa atau belum tersedia.
							</p>
							{onRequestNewToken && (
								<button
									type="button"
									onClick={onRequestNewToken}
									disabled={isStarting}
									className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-iron bg-obsidian px-3 font-sans text-xs font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									<Icon icon={RefreshIcon} size={12} />
									<span>Dapatkan token baru</span>
								</button>
							)}
						</div>
					)}
				</div>
				{payload && (
					<div className="flex justify-end">
						<button
							type="button"
							onClick={onCopy}
							aria-label="Salin prompt instruksi sync"
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-iron bg-charcoal px-3 py-1 font-sans text-xs font-semibold text-snow transition hover:bg-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							{copied ? (
								<>
									<Icon
										icon={Tick01Icon}
										size={13}
										className="text-emerald-400"
									/>
									<span className="text-emerald-400">Tersalin</span>
								</>
							) : (
								<>
									<Icon icon={Copy01Icon} size={13} />
									<span>Salin prompt</span>
								</>
							)}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

export function ResyncStep2Agent({ stepState }: { stepState: StepState }) {
	return (
		<div
			data-testid="resync-step-2"
			data-step-state={stepState}
			className="flex items-start gap-3.5"
		>
			<StepIndicator step={2} state={stepState} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<h3 className="text-xs font-semibold text-mist">
					Jalankan di AI coding agent
				</h3>
				<p className="text-[11px] leading-relaxed text-fog">
					Gunakan root repository lokal.
				</p>
			</div>
		</div>
	);
}

export function ResyncStep3Progress({
	stepState,
	status,
	statusError,
	stageView,
	isVerified,
	isStarting,
	isAnalyzing,
	analysis,
	analysisError,
	onRetrySync,
	onRetryAnalysis,
}: {
	stepState: StepState;
	status: SyncStatusResponse | null;
	statusError: string | null;
	stageView: SyncStageView;
	isVerified: boolean;
	isStarting: boolean;
	isAnalyzing: boolean;
	analysis: AnalysisResponse | null;
	analysisError: string | null;
	onRetrySync?: () => void;
	onRetryAnalysis?: () => void;
}) {
	return (
		<div
			data-testid="resync-step-3"
			data-step-state={stepState}
			className="flex items-start gap-3.5"
		>
			<StepIndicator step={3} state={stepState} />
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex flex-col">
					<h3 className="text-xs font-semibold text-mist">
						Pantau sinkronisasi
					</h3>
					<p className="text-[11px] leading-relaxed text-fog">
						Status sinkronisasi snapshot repository secara real-time.
					</p>
				</div>
				{statusError && (
					<p
						role="alert"
						className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-[11px] text-crimson"
					>
						{statusError}
					</p>
				)}
				{stageView.hasStarted ? (
					<SyncStageList
						status={status}
						showAnalysisFailure={
							(Boolean(analysisError) ||
								status?.analysisAttemptStatus === "failed" ||
								status?.analysisStatus === "failed" ||
								analysis?.status === "failed") &&
							Boolean(onRetryAnalysis)
						}
						analysisError={analysisError}
						onRetryAnalysis={onRetryAnalysis}
						isAnalyzing={isAnalyzing}
					/>
				) : stageView.failed ? (
					<div
						role="alert"
						className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-[11px]"
					>
						<div className="flex items-start gap-2.5">
							<Icon
								icon={AlertCircleIcon}
								size={14}
								className="mt-0.5 shrink-0 text-crimson"
								aria-hidden="true"
							/>
							<div className="flex flex-1 flex-col gap-1">
								<span className="font-semibold text-snow">
									Sinkronisasi belum berhasil
								</span>
								{stageView.errorMessage && (
									<span className="leading-relaxed text-fog">
										{stageView.errorMessage}
									</span>
								)}
								<span className="leading-relaxed text-fog">
									{stageView.retryHint}
								</span>
								{onRetrySync && (
									<button
										type="button"
										onClick={onRetrySync}
										disabled={isStarting}
										className="mt-1 inline-flex min-h-8 w-fit items-center rounded border border-iron bg-obsidian px-3 font-sans text-[11px] font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										Coba lagi
									</button>
								)}
							</div>
						</div>
					</div>
				) : (
					<p className="text-[11px] leading-relaxed text-fog">
						Menunggu agent terhubung dari terminal repository...
					</p>
				)}
				{isVerified && (
					<div
						data-testid="resync-success-banner"
						className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs"
					>
						<Icon
							icon={Tick01Icon}
							size={16}
							className="mt-0.5 shrink-0 text-emerald-400"
							aria-hidden="true"
						/>
						<div className="flex flex-col gap-0.5">
							<span className="font-semibold text-snow">
								Sinkronisasi berhasil
							</span>
							<span className="text-[11px] text-fog">
								Source code terbaru tersimpan.
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
