"use client";

import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import type {
	SyncStageView,
	SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { SyncStageList } from "./sync-stage-list";

interface ScreenConnectSyncStepProps {
	/** The reconciled sync status for this attempt, owned by the polling screen. */
	status: SyncStatusResponse | null;
	/** The one shared stage mapping, resolved by the screen that owns the status. */
	stageView: SyncStageView;
	/** A failed or expired attempt that the owner can restart. */
	canRetry: boolean;
	/** Reconciliation error from the owning loop. */
	statusError: string | null;
	isStarting: boolean;
	onRetrySync?: () => void;
	/**
	 * Whether the server produced a usable current snapshot, which is the only
	 * thing that unlocks the conclusion step.
	 *
	 * Copying the prompt is browser-local feedback and deliberately has no
	 * influence here — only a finished upload does.
	 */
	canContinueToSummary: boolean;
	analysis: AnalysisResponse | null;
	analysisError: string | null;
	isAnalyzing: boolean;
	onRetryAnalysis?: () => void;
	isLegacyAnalysisMissingSuggestions: boolean;
	onRefreshLegacySuggestions?: () => void;
}

export function ScreenConnectSyncStep({
	status,
	stageView,
	canRetry,
	statusError,
	isStarting,
	onRetrySync,
	canContinueToSummary,
	analysis,
	analysisError,
	isAnalyzing,
	onRetryAnalysis,
	isLegacyAnalysisMissingSuggestions,
	onRefreshLegacySuggestions,
}: ScreenConnectSyncStepProps) {
	return (
		<div className="flex items-start gap-3.5">
			<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
				3
			</span>
			<div className="flex flex-1 flex-col gap-2">
				<div className="text-xs font-semibold text-mist">
					Paste prompt lalu jalankan
				</div>
				<p className="text-[11px] leading-relaxed text-fog">
					Jalankan prompt dari root repository untuk mulai menyinkronkan
					codebase.
				</p>

				{/* Attempt identity, so a reported status can be tied to the
				session the user actually started. Kept as quiet metadata and
				out of the progress narrative. Only shown once real sync
				activity has started. */}
				{stageView.hasStarted && status?.sessionId && (
					<p className="font-mono text-[11px] text-fog">
						Sync ID: {status.sessionId.slice(0, 12)}...
						{status.updatedAt
							? ` · ${new Date(status.updatedAt).toLocaleTimeString("id-ID")}`
							: null}
					</p>
				)}

				{/* The browser has not heard from the server yet, so no stage
				can honestly be claimed. */}
				{!stageView.hasStatus && !stageView.failed && (
					<p className="text-[11px] leading-relaxed text-fog">
						Menghubungkan server...
					</p>
				)}

				{/* The one live sync presentation for this flow: agent, source
				preparation, upload, the analysis state, and the neutral
				sync summary — all mapped from the same polled server
				status. A failed analysis expands inside its own row;
				no second alert is rendered below it. */}
				<SyncStageList
					status={status}
					isAnalysisReady={canContinueToSummary}
					showAnalysisFailure={
						!isLegacyAnalysisMissingSuggestions &&
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

				{statusError && (
					<p
						role="alert"
						className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-[11px] text-crimson"
					>
						{statusError}
					</p>
				)}

				{/* Retry belongs here, contextually, instead of on a screen the
				user has to navigate to in order to find it. */}
				{canRetry && (
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
							<span className="flex flex-1 flex-col gap-1">
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
								<button
									type="button"
									onClick={onRetrySync}
									disabled={isStarting}
									className="mt-1 inline-flex min-h-8 w-fit items-center rounded border border-iron bg-obsidian px-3 font-sans text-[11px] font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Coba lagi
								</button>
							</span>
						</div>
					</div>
				)}
				{isLegacyAnalysisMissingSuggestions &&
					Boolean(onRefreshLegacySuggestions) && (
						<div
							role="alert"
							data-testid="legacy-analysis-warning"
							className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px]"
						>
							<div className="flex items-start gap-2.5">
								<Icon
									icon={AlertCircleIcon}
									size={14}
									className="mt-0.5 shrink-0 text-amber-400"
									aria-hidden="true"
								/>
								<span className="flex flex-1 flex-col gap-1">
									<span className="font-semibold text-snow">
										Rekomendasi task awal belum tersedia
									</span>
									<span className="leading-relaxed text-fog">
										Analisis codebase telah selesai tetapi memerlukan pembaruan
										rekomendasi task awal sebelum dapat dilanjutkan.
									</span>
									{analysisError && (
										<span className="leading-relaxed text-crimson">
											{analysisError}
										</span>
									)}
									<button
										type="button"
										data-testid="refresh-legacy-suggestions-button"
										onClick={onRefreshLegacySuggestions}
										disabled={isStarting || isAnalyzing}
										className="mt-1 inline-flex min-h-8 w-fit items-center rounded border border-iron bg-obsidian px-3 font-sans text-[11px] font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										Perbarui rekomendasi
									</button>
								</span>
							</div>
						</div>
					)}
			</div>
		</div>
	);
}
