"use client";

import {
	AlertCircle,
	ArrowRight,
	Check,
	Circle,
	Info,
	Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	isSyncStatusComplete,
	isTerminalSyncStatus,
	type SyncStatusResponse,
	syncStatusResponseSchema,
} from "@/lib/codebase-sync";
import {
	CODEBASE_SYNC_POLL_INTERVAL_MS,
	CODEBASE_SYNC_REQUEST_TIMEOUT_MS,
} from "@/lib/constants";

interface SyncStatusProps {
	projectId: string;
	statusPath?: string;
	sessionId?: string;
	projectName?: string;
	status?: SyncStatusResponse | null;
	pollIntervalMs?: number;
	requestTimeoutMs?: number;
	// Onboarding/analysis project that owns the per-feature analysis record. The
	// status endpoint only attaches `analysisStatus` when this project query is
	// present. It never affects the two sync stages: analysis is a separate
	// capability surfaced next to the review action, not a sync step.
	analysisProjectId?: string;
	onStatus?: (status: SyncStatusResponse | null) => void;
	onRetrySync?: () => void;
	onRetryAnalysis?: () => void;
	onViewReview?: () => void;
	onEnterWorkspace?: () => void;
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
	analysisProjectId,
	onStatus,
	onRetrySync,
	onRetryAnalysis,
	onViewReview,
	onEnterWorkspace,
	onBackToInstructions,
}: SyncStatusProps) {
	const [polledStatus, setPolledStatus] = useState<SyncStatusResponse | null>(
		propStatus ?? null,
	);
	const status = polledStatus ?? propStatus ?? null;
	const hasStatus = status !== null;
	const [error, setError] = useState<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef(false);
	const abortRef = useRef<AbortController | null>(null);
	const seqRef = useRef(0);
	const onStatusRef = useRef(onStatus);
	onStatusRef.current = onStatus;
	// Poll internally unless the parent provided an already-terminal status.
	const pollInternally =
		!propStatus || !isTerminalSyncStatus(propStatus.status);
	// Pin subsequent polls to the session observed from the server so a
	// concurrent retry (new latest session) cannot silently retarget polling.
	// Explicit sessionId prop wins; otherwise reuse the last successful
	// sessionId. A ref (not state) ensures the very next tick in the same
	// effect run already uses the pinned id without waiting for a restart.
	const pinnedSessionRef = useRef<string | null>(
		sessionId ?? polledStatus?.sessionId ?? propStatus?.sessionId ?? null,
	);
	if (sessionId) pinnedSessionRef.current = sessionId;

	useEffect(() => {
		if (!pollInternally) return;
		seqRef.current += 1;
		const seq = seqRef.current;
		let cancelled = false;

		const scheduleNext = (fn: () => void) => {
			if (cancelled || seq !== seqRef.current) return;
			timeoutRef.current = setTimeout(fn, pollIntervalMs);
		};

		const fetchStatus = async () => {
			if (cancelled || seq !== seqRef.current) return;
			if (inFlightRef.current) {
				scheduleNext(() => {
					void fetchStatus();
				});
				return;
			}
			inFlightRef.current = true;
			const controller = new AbortController();
			abortRef.current = controller;
			const abortTimeout = setTimeout(
				() => controller.abort(),
				requestTimeoutMs,
			);
			let isTerminal = false;
			try {
				const activeSessionId = sessionId ?? pinnedSessionRef.current;
				const queryParams = new URLSearchParams();
				if (activeSessionId) queryParams.set("sessionId", activeSessionId);
				if (analysisProjectId) queryParams.set("projectId", analysisProjectId);
				const query = queryParams.toString() ? `?${queryParams}` : "";
				const path =
					statusPath ??
					`/api/codebases/${encodeURIComponent(projectId)}/status`;
				const res = await fetch(`${path}${query}`, {
					signal: controller.signal,
				});
				if (cancelled || seq !== seqRef.current) return;
				if (controller.signal.aborted) return;
				const json = (await res.json().catch(() => null)) as unknown;
				if (cancelled || seq !== seqRef.current) return;
				if (!res.ok) {
					const message =
						typeof json === "object" &&
						json !== null &&
						"error" in json &&
						typeof json.error === "string"
							? json.error
							: "Gagal membaca status sync.";
					setError(message);
					return;
				}
				const parsed = syncStatusResponseSchema.safeParse(json);
				if (!parsed.success) {
					setError("Gagal membaca status sync.");
					return;
				}
				if (cancelled || seq !== seqRef.current) return;
				pinnedSessionRef.current = parsed.data.sessionId;
				setPolledStatus(parsed.data);
				setError(null);
				onStatusRef.current?.(parsed.data);
				if (isTerminalSyncStatus(parsed.data.status)) {
					isTerminal = true;
				}
			} catch {
				if (cancelled || seq !== seqRef.current) return;
				if (controller.signal.aborted) return;
				setError("Gagal menghubungi server.");
			} finally {
				clearTimeout(abortTimeout);
				if (seq === seqRef.current) {
					inFlightRef.current = false;
					if (abortRef.current === controller) abortRef.current = null;
				}
				if (!cancelled && seq === seqRef.current && !isTerminal) {
					scheduleNext(() => {
						void fetchStatus();
					});
				}
			}
		};

		void fetchStatus();
		return () => {
			cancelled = true;
			abortRef.current?.abort();
			abortRef.current = null;
			inFlightRef.current = false;
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		};
	}, [
		projectId,
		statusPath,
		sessionId,
		pollIntervalMs,
		pollInternally,
		requestTimeoutMs,
		analysisProjectId,
	]);

	const s = status?.status;
	const isFailed = s === "failed";
	const isExpired = s === "expired";
	const isConnected =
		hasStatus && s !== "waiting_for_cli" && !isFailed && !isExpired;
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

	// Analysis is a separate capability. It never gates the sync stages and
	// never gates workspace entry; it only decides whether the review
	// conclusion may be opened and whether a retry is offered.
	const analysisState = status?.analysisStatus;
	const analysisReady = analysisState === "ready" || s === "ready";
	const analysisFailed = analysisState === "failed";
	const canViewReview = syncComplete && analysisReady;

	const transportActive =
		hasStatus && (s === "scanning" || s === "filtering" || s === "uploading");

	const showRetry = syncComplete || isFailed || isExpired;
	const showAnalysisRetry = analysisFailed;

	// Review availability is a secondary capability line, not a third stage:
	// it sits beside the conclusion action and never claims the sync is still
	// running.
	const reviewStatusLabel = analysisReady
		? "Ringkasan siap."
		: analysisFailed
			? "Ringkasan belum berhasil disiapkan."
			: "Ringkasan sedang disiapkan.";

	type StageState = "done" | "active" | "idle" | "failed" | "pending";
	// Success is an accent, not a full surface: light mode stays on the
	// neutral theme-aware surface (white/graphite/dark text) with only the
	// check icon carrying green, while dark mode keeps its subtle emerald
	// tint. No full mint block in either mode.
	const stageClass: Record<StageState, string> = {
		done: "border-graphite bg-obsidian text-snow dark:border-emerald-500/25 dark:bg-emerald-500/10",
		active: "border-blue-500/25 bg-blue-500/10 text-blue-200",
		idle: "border-graphite bg-obsidian/70 text-fog",
		failed: "border-crimson/30 bg-crimson/10 text-crimson",
		pending: "border-graphite text-slate",
	};
	const StageIcon = ({ state }: { state: StageState }) =>
		state === "done" ? (
			<Check
				size={14}
				className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0"
			/>
		) : state === "active" ? (
			<Loader2 size={14} className="text-blue-400 animate-spin shrink-0" />
		) : state === "idle" ? (
			<Circle
				size={14}
				className="text-amber-400/90 shrink-0 fill-amber-400/30"
			/>
		) : state === "failed" ? (
			<AlertCircle size={14} className="text-crimson shrink-0" />
		) : (
			<Circle size={14} className="text-slate shrink-0" />
		);

	const connectionStage: StageState = isFailed
		? "failed"
		: isExpired
			? "failed"
			: isConnected
				? "done"
				: !hasStatus
					? "pending"
					: s === "waiting_for_cli"
						? "idle"
						: "active";
	const uploadStage: StageState = !isConnected
		? "pending"
		: syncComplete
			? "done"
			: transportActive
				? "active"
				: "pending";

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
										: isConnected
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
					transport signals. AI analysis is not a sync step, so it never
					appears here. */}
					<div className="flex flex-col gap-2.5">
						{/* Stage 1: agent handshake (session left waiting_for_cli) */}
						<div
							data-testid="sync-stage-connection"
							data-stage-state={connectionStage}
							className={`flex items-start gap-2.5 rounded-md border p-3 text-xs transition-colors ${stageClass[connectionStage]}`}
						>
							<span className="mt-0.5">
								<StageIcon state={connectionStage} />
							</span>
							<span className="flex flex-1 flex-col gap-0.5">
								<span className="font-medium">
									{isConnected
										? "Repository terhubung"
										: isFailed
											? "Sync gagal"
											: isExpired
												? "Sesi kedaluwarsa sebelum CLI terhubung"
												: !hasStatus
													? "Menghubungi server untuk membaca status sync..."
													: "Repository belum terhubung"}
								</span>
								{isConnected || s === "waiting_for_cli" ? (
									<span className="text-[11px] leading-relaxed opacity-80">
										{isConnected
											? "Agent berhasil tersambung ke VibeEverything."
											: "Menunggu agent terhubung ke VibeEverything."}
									</span>
								) : null}
							</span>
						</div>

						{/* Stage 2: source sync (scanning/filtering/uploading, then the
					completed snapshot). Done means the upload finished and the
					snapshot is usable — never that analysis ran. */}
						<div
							data-testid="sync-stage-upload"
							data-stage-state={uploadStage}
							className={`flex items-start gap-2.5 rounded-md border p-3 text-xs transition-colors ${stageClass[uploadStage]}`}
						>
							<span className="mt-0.5">
								<StageIcon state={uploadStage} />
							</span>
							<span className="flex flex-1 flex-col gap-0.5">
								<span className="font-medium">
									{syncComplete
										? "Source code tersinkron"
										: transportActive
											? "Menyinkronkan source code..."
											: "Source code belum tersinkron"}
								</span>
								<span className="text-[11px] leading-relaxed opacity-80">
									{syncComplete
										? typeof status?.fileCount === "number"
											? `${status.fileCount} file berhasil diterima.`
											: "Repository berhasil diterima."
										: transportActive
											? "Repository sedang dikirim ke VibeEverything."
											: "Tahap ini berjalan setelah agent terhubung."}
								</span>
							</span>
							{status?.fileCount !== undefined && !syncComplete && (
								<span className="ml-auto font-mono text-[11px] opacity-80">
									{status.fileCount} file
								</span>
							)}
						</div>
					</div>

					{/* Exclusion count is reported only once the server has it */}
					{status?.excludedCount !== undefined && (
						<p className="font-mono text-[11px] text-fog">
							{status.excludedCount} file dikecualikan otomatis (rahasia,
							dependensi, build, binary)
						</p>
					)}

					{/* Error Message if any */}
					{status?.errorMessage && (
						<div className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-xs text-crimson">
							{status.errorMessage}
						</div>
					)}
					{error && (
						<div className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-xs text-crimson">
							{error}
						</div>
					)}

					{/* Footer Bar: unified navigation inside the card. Left holds the
				reverse path and sync retry; the right cluster is ordered so the
				workspace is the primary action and the review conclusion is the
				secondary one. */}
					<div className="flex flex-col items-stretch gap-3 border-t border-graphite pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
						<div className="flex flex-wrap items-center gap-2">
							{onBackToInstructions && (
								<button
									type="button"
									onClick={onBackToInstructions}
									className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-3.5 py-2 text-xs font-medium text-fog hover:border-steel hover:text-snow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									← Kembali ke Prompt Sync
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

						{(onViewReview || onEnterWorkspace || onRetryAnalysis) && (
							<div className="flex flex-col items-stretch gap-2 sm:ml-auto sm:items-end">
								{/* Analysis is a secondary capability, never a sync stage: a
								single status line beside the conclusion action. */}
								{syncComplete && (onViewReview || onRetryAnalysis) && (
									<span
										data-testid="sync-review-status"
										className="font-mono text-[11px] text-fog sm:text-right"
									>
										{reviewStatusLabel}
									</span>
								)}

								<div className="flex flex-wrap items-center gap-2 sm:justify-end">
									{showAnalysisRetry && syncComplete && onRetryAnalysis && (
										<button
											type="button"
											onClick={onRetryAnalysis}
											className="rounded-md border border-iron bg-obsidian px-3 py-2 text-xs text-mist hover:text-snow transition hover:bg-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											Coba analisis lagi
										</button>
									)}

									{onViewReview && (
										<button
											type="button"
											data-testid="plan-continue-to-summary"
											onClick={onViewReview}
											disabled={!canViewReview}
											title={
												analysisReady
													? "Lihat kesimpulan codebase"
													: "Ringkasan belum siap — sync sudah selesai"
											}
											className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-4 py-2 font-inter text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
												canViewReview
													? "border-graphite bg-obsidian text-snow hover:border-steel hover:bg-steel cursor-pointer"
													: "border-graphite bg-charcoal/50 text-fog/40 cursor-not-allowed"
											}`}
										>
											<span>Lihat Kesimpulan</span>
											{analysisReady && (
												<ArrowRight size={14} aria-hidden="true" />
											)}
										</button>
									)}

									{onEnterWorkspace && (
										<button
											type="button"
											data-testid="sync-enter-workspace"
											onClick={onEnterWorkspace}
											disabled={!syncComplete}
											title={
												syncComplete
													? "Buka workspace codebase"
													: "Tunggu hingga source code selesai tersinkron"
											}
											className={`inline-flex items-center justify-center gap-1.5 rounded-md px-5 py-2 font-inter text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
												syncComplete
													? "bg-snow text-onyx shadow-sm hover:brightness-110 cursor-pointer"
													: "border border-graphite bg-charcoal/50 text-fog/40 cursor-not-allowed"
											}`}
										>
											<span>Masuk ke Workspace</span>
											<ArrowRight size={14} aria-hidden="true" />
										</button>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
