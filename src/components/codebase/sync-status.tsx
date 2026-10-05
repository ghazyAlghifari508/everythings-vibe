"use client";

import { AlertCircle, ArrowRight, Info, Loader2 } from "lucide-react";
import { useCodebaseSyncStatus } from "@/hooks/use-codebase-sync-status";
import {
	canOpenSummary,
	isSyncStatusComplete,
	isTerminalSyncStatus,
	resolveSyncStageView,
	type SyncStatusResponse,
} from "@/lib/codebase-sync";
import {
	CODEBASE_SYNC_POLL_INTERVAL_MS,
	CODEBASE_SYNC_REQUEST_TIMEOUT_MS,
} from "@/lib/constants";
import { SyncStageList } from "./sync-stage-list";

interface SyncStatusProps {
	projectId: string;
	statusPath?: string;
	sessionId?: string;
	projectName?: string;
	status?: SyncStatusResponse | null;
	pollIntervalMs?: number;
	requestTimeoutMs?: number;
	/**
	 * Who owns the status reconciliation loop.
	 *
	 * `self` (default) keeps this component the single owner for callers that
	 * have no poller of their own. `parent` makes it a pure reader of the
	 * `status` prop — required whenever an ancestor already polls, because two
	 * concurrent loops would race each other into contradictory states.
	 */
	statusPolling?: "self" | "parent";
	/** Project owning the per-feature analysis record; reported by the server. */
	analysisProjectId?: string;
	onRetrySync?: () => void;
	onContinueToSummary?: () => void;
	onBackToInstructions?: () => void;
}

export function SyncStatus({
	projectId,
	statusPath,
	sessionId,
	projectName = "Project",
	status: propStatus,
	pollIntervalMs = CODEBASE_SYNC_POLL_INTERVAL_MS,
	requestTimeoutMs = CODEBASE_SYNC_REQUEST_TIMEOUT_MS,
	statusPolling = "self",
	analysisProjectId,
	onRetrySync,
	onContinueToSummary,
	onBackToInstructions,
}: SyncStatusProps) {
	// Self-polling only when this component is the owner. A parent-owned loop
	// feeds `status` instead, so this hook stays dormant and the screen renders
	// exactly one reconciled snapshot.
	const pollInternally =
		statusPolling === "self" &&
		(!propStatus || !isTerminalSyncStatus(propStatus.status));
	const { status: polledStatus, error } = useCodebaseSyncStatus({
		codebaseId: pollInternally ? projectId : null,
		statusPath,
		sessionId,
		analysisProjectId: analysisProjectId ?? null,
		pollIntervalMs,
		requestTimeoutMs,
		enabled: pollInternally,
		initialStatus: propStatus ?? null,
	});
	const status = polledStatus ?? propStatus ?? null;
	const hasStatus = status !== null;

	const s = status?.status;
	const isFailed = s === "failed";
	const isExpired = s === "expired";
	const isUploading = hasStatus && s === "uploading";
	const isLoadingInitial = !hasStatus && error === null;
	const hasPollError = error !== null;

	// Sync completion is transport-only: a usable current snapshot plus a
	// finished upload chain. `analyzing` is a session state used by legacy
	// project-scoped sessions while the model runs — codebase-scoped sessions
	// stay on `uploaded` — and both mean the transport is already done.
	// Analysis status is deliberately excluded, so a pending or failed analysis
	// can never make a completed sync look unfinished.
	const syncComplete = isSyncStatusComplete(status);

	// The conclusion step is entered on transport completion alone: an uploaded
	// snapshot is a finished sync, and the summary step owns the analysis
	// pending state itself instead of making the user wait for another hop.
	const summaryReady = canOpenSummary(
		status ?? { status: "waiting_for_cli", snapshotId: null },
	);

	// One shared mapping decides every word below, including which stages are
	// done. Deriving copy from a second set of local booleans is how two
	// screens end up telling the user two different stories.
	const stageView = resolveSyncStageView(status);
	// A finished sync can be re-run on request, and a failed or expired one has
	// no other way forward — both offer the retry that mints a fresh credential.
	const showRetry = stageView.canRetry || stageView.syncComplete;

	return (
		<div className="w-full animate-enter flex flex-col gap-6">
			{/* Page Head matching existing-codebase-flow.html screen 03 */}
			<div className="flex flex-col gap-3">
				<div>
					<div className="text-[11px] font-mono tracking-widest uppercase text-fog mb-2">
						PROJECT / {projectName.toUpperCase()}
					</div>
					<h1 className="font-inter text-2xl sm:text-3xl font-[620] tracking-tight text-snow leading-tight">
						Sync codebase
					</h1>
					<p className="mt-2 text-xs sm:text-sm text-fog max-w-xl leading-relaxed">
						VibeEverything CLI menjalankan sync dari repositori lokal kamu.
						Perintahnya berjalan di terminal agent — progress di bawah mengikuti
						status server yang sebenarnya.
					</p>
				</div>
			</div>

			{/* Main Status Panel: the review CTA lives in this card footer —
			never in a sibling completion card. */}
			<div
				data-testid="sync-card"
				className="rounded-xl border border-graphite bg-charcoal/90 overflow-hidden"
			>
				{/* Panel Head */}
				<div className="flex items-center justify-between border-b border-graphite p-5 sm:p-6">
					<div>
						<h3 className="font-inter text-sm sm:text-base font-[620] text-snow">
							Analisis repository lokal
						</h3>
						<p className="mt-1 font-mono text-[11px] text-fog">
							{status?.sessionId
								? `Sync ID: ${status.sessionId.slice(0, 12)}...`
								: "Menghubungi server..."}
							{status?.updatedAt &&
								` · ${new Date(status.updatedAt).toLocaleTimeString("id-ID")}`}
						</p>
					</div>
					<span className="font-mono text-xs text-fog">
						{isFailed
							? "Sync gagal"
							: isExpired
								? "Sesi kedaluwarsa"
								: syncComplete
									? "Sync selesai"
									: isUploading
										? "Mengupload"
										: stageView.repository.state === "done"
											? "Terhubung"
											: hasStatus
												? "Standby"
												: hasPollError
													? "Gagal memuat"
													: "Menghubungi..."}
					</span>
				</div>

				{/* Panel Body */}
				<div className="p-5 sm:p-6 flex flex-col gap-5">
					{/* Loading: browser has not yet received any server state. This is
					distinct from waiting_for_cli (server says no CLI yet). Never show
					the waiting copy while status is null. */}
					{isLoadingInitial && (
						<div
							data-testid="sync-loading"
							className="rounded-lg border border-graphite bg-obsidian/70 p-4 text-xs text-fog flex items-center gap-3"
						>
							<Loader2
								size={16}
								className="shrink-0 animate-spin text-fog"
								aria-hidden="true"
							/>
							<div className="flex flex-col gap-0.5">
								<span className="font-semibold text-snow">
									Menghubungi server...
								</span>
								<p className="text-[11px] text-fog leading-relaxed">
									Memuat status sync terbaru dari server.
								</p>
							</div>
						</div>
					)}
					{/* Polling error with no successful state yet: honest server
					error, never disguised as waiting_for_cli. */}
					{!hasStatus && hasPollError && (
						<div
							data-testid="sync-poll-error"
							className="rounded-lg border border-crimson/30 bg-crimson/10 p-4 text-xs text-fog flex items-start gap-3"
						>
							<AlertCircle
								size={16}
								className="mt-0.5 shrink-0 text-crimson"
								aria-hidden="true"
							/>
							<div className="flex flex-col gap-0.5">
								<span className="font-semibold text-snow">
									Gagal memuat status sync
								</span>
								<p className="text-[11px] text-fog leading-relaxed">
									Browser belum berhasil mendapatkan status dari server. Polling
									akan mencoba lagi otomatis.
								</p>
							</div>
						</div>
					)}
					{/* Standby notification when the server explicitly reports
					waiting for the first CLI command. Requires hasStatus so a
					null/error state never renders this copy. */}
					{hasStatus && s === "waiting_for_cli" && (
						<div
							data-testid="cli-waiting-alert"
							className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-fog flex items-start gap-3"
						>
							<Info
								size={16}
								className="mt-0.5 shrink-0 text-amber-400"
								aria-hidden="true"
							/>
							<div className="flex flex-col gap-0.5">
								<span className="font-semibold text-snow">
									CLI Agent Belum Terhubung
								</span>
								<p className="text-[11px] text-fog leading-relaxed">
									Buka terminal lokal Anda di root repositori, lalu paste dan
									jalankan prompt sync. Halaman ini akan otomatis mendeteksi
									progress ketika agent mulai mengirim file.
								</p>
							</div>
						</div>
					)}

					{/* Status List — two user-facing sync stages backed by real
					transport signals, mapped once by `resolveSyncStageView`. AI
					analysis is not a sync step, so it never appears here. */}
					<SyncStageList status={status} />

					{/* A stored message is only this screen's business while the sync
					itself is unfinished. The status endpoint sources this field from
					the analysis record, so on a finished sync it describes a
					conclusion problem — which the conclusion step owns. */}
					{stageView.errorMessage && (
						<div className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-xs text-crimson">
							{stageView.errorMessage}
						</div>
					)}
					{error && (
						<div className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-xs text-crimson">
							{error}
						</div>
					)}

					{/* Footer: step navigation only. This screen reports transport
					and nothing else — the conclusion step owns analysis, so no
					analysis status line or retry belongs here. */}
					<div className="flex flex-col items-stretch gap-3 border-t border-graphite pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
						<div className="flex flex-wrap items-center gap-2">
							{onBackToInstructions && (
								<button
									type="button"
									onClick={onBackToInstructions}
									className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-3.5 py-2 text-xs font-medium text-fog hover:border-steel hover:text-snow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Kembali ke Prompt Sync
								</button>
							)}

							{showRetry && onRetrySync && (
								<button
									type="button"
									onClick={onRetrySync}
									className="rounded-md border border-iron bg-obsidian px-3 py-2 text-xs text-mist hover:text-snow transition hover:bg-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Sync ulang
								</button>
							)}
						</div>

						{onContinueToSummary && (
							<button
								type="button"
								data-testid="plan-continue-to-summary"
								onClick={onContinueToSummary}
								disabled={!summaryReady}
								title={
									summaryReady
										? "Buka kesimpulan codebase"
										: "Tunggu hingga source code selesai tersinkron"
								}
								className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-4 py-2 font-inter text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo sm:ml-auto ${
									summaryReady
										? "border-graphite bg-obsidian text-snow hover:border-steel hover:bg-steel cursor-pointer"
										: "border-graphite bg-charcoal/50 text-fog/40 cursor-not-allowed"
								}`}
							>
								<span>Lanjut ke Kesimpulan</span>
								<ArrowRight size={14} aria-hidden="true" />
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
