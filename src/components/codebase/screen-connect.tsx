"use client";

import { AlertCircle, ArrowRight, Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveCodebaseDisplayName } from "@/lib/codebase-naming";
import {
	buildAgentPrompt,
	resolveSyncStageView,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/lib/codebase-sync";
import { AiHarnessLogos } from "./ai-harness-logos";
import { SyncStageList } from "./sync-stage-list";

interface ScreenConnectProps {
	projectName: string;
	payload: SyncPromptPayload | null;
	isStarting?: boolean;
	/**
	 * The reconciled sync status for this attempt, owned by the screen that owns
	 * the polling loop. `null` means the browser has not received any server
	 * state yet, which is reported as such rather than as standby.
	 *
	 * This component never polls: a second loop would race the owner's and let
	 * two parts of the same flow disagree about what the server said.
	 */
	status: SyncStatusResponse | null;
	/** Reconciliation error from the owning loop. */
	statusError?: string | null;
	/** Mints a fresh one-time sync credential for a new attempt. */
	onRequestNewToken?: () => void;
	/** Mints a fresh credential in response to a failed or expired session. */
	onRetrySync?: () => void;
	/**
	 * Whether the server produced a usable current snapshot, which is the only
	 * thing that unlocks the conclusion step.
	 *
	 * Copying the prompt is browser-local feedback and deliberately has no
	 * influence here — only a finished upload does.
	 */
	canContinueToSummary?: boolean;
	/**
	 * Advance to the conclusion step. Omit it when this screen has no next step
	 * of its own; the instruction screen then renders without a continue action
	 * rather than offering a button that goes nowhere.
	 */
	onContinueToSummary?: () => void;
}

export function ScreenConnect({
	projectName,
	payload,
	isStarting = false,
	status,
	statusError = null,
	onRequestNewToken,
	onRetrySync,
	canContinueToSummary = false,
	onContinueToSummary,
}: ScreenConnectProps) {
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState<string | null>(null);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
				copyTimeoutRef.current = null;
			}
		};
	}, []);

	const promptText = payload ? buildAgentPrompt(payload, { projectName }) : "";
	// A provisional creation name is storage-only: the eyebrow shows neutral
	// copy until the CLI handshake reports the real repository folder name.
	const displayName =
		resolveCodebaseDisplayName(projectName) ?? "Repository belum terdeteksi";
	const stageView = resolveSyncStageView(status);
	const canAdvance =
		canContinueToSummary && !isStarting && Boolean(onContinueToSummary);
	const canRetry = stageView.canRetry && Boolean(onRetrySync);

	const handleCopy = async () => {
		if (!promptText) return;
		try {
			if (!navigator.clipboard?.writeText) {
				throw new Error("Clipboard API tidak tersedia");
			}
			await navigator.clipboard.writeText(promptText);
			setCopied(true);
			setCopyError(null);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
			setCopyError(
				"Gagal menyalin otomatis. Silakan salin teks secara manual.",
			);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopyError(null), 4000);
		}
	};

	return (
		<div className="w-full animate-enter">
			<div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-iron bg-obsidian/90 shadow-2xl backdrop-blur-xl">
				<div className="border-b border-graphite p-5 sm:p-6">
					{/* The server owns this name once the CLI has handshaken, so the
					eyebrow drops the creation placeholder and shows the detected
					repository folder. */}
					<div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">
						Project / {displayName}
					</div>
					<h2 className="font-inter text-lg font-[600] text-snow sm:text-xl">
						Sync codebase dengan VibeEverything
					</h2>
					<p className="mt-1.5 text-xs leading-relaxed text-fog sm:text-sm">
						Salin prompt ini dan paste ke Claude Code, Cursor, Windsurf, atau AI
						agent lain dari root repository kamu.
					</p>
				</div>

				<div className="flex flex-col gap-6 p-5 sm:p-6">
					<div className="flex items-start gap-3.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
							1
						</span>
						<div className="flex flex-1 flex-col gap-2">
							<div className="text-xs font-semibold text-mist">
								Copy prompt untuk AI agent
							</div>
							<div className="relative min-h-[90px] rounded-lg border border-graphite bg-onyx p-3.5 font-mono text-xs leading-relaxed text-mist sm:p-4">
								{payload ? (
									<>
										<button
											type="button"
											onClick={handleCopy}
											className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded border border-iron bg-obsidian px-2.5 py-1 font-sans text-[11px] text-fog transition hover:bg-steel hover:text-snow"
										>
											{copied ? (
												<>
													<Check size={12} className="text-emerald-400" />
													<span className="text-emerald-400">Tersalin</span>
												</>
											) : (
												<>
													<Copy size={12} />
													<span>Salin</span>
												</>
											)}
										</button>
										<div className="hide-scrollbar max-h-48 select-all overflow-y-auto whitespace-pre-wrap pr-16 text-snow">
											{promptText}
										</div>
										{copyError && (
											<p className="mt-2 font-sans text-[11px] text-crimson">
												{copyError}
											</p>
										)}
									</>
								) : isStarting ? (
									<div className="flex items-center justify-center gap-2 py-6 font-sans text-xs text-fog">
										<Loader2 size={14} className="animate-spin text-blue-400" />
										<span>Menyiapkan token sesi...</span>
									</div>
								) : (
									/* The sync credential is deliberately never persisted, so a
									   refresh mid-attempt cannot restore the prompt text. The
									   attempt itself is still tracked below — only the token is
									   missing, and a new one mints a new attempt. */
									<div className="flex flex-col items-center justify-center gap-3 py-6 text-center font-sans">
										<p className="text-xs text-fog">
											Token sync hanya berlaku sekali dan tidak disimpan di
											browser.
										</p>
										{onRequestNewToken && (
											<button
												type="button"
												onClick={onRequestNewToken}
												disabled={isStarting}
												className="inline-flex min-h-9 items-center rounded-md border border-iron bg-obsidian px-3.5 font-sans text-[11px] font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
											>
												Dapatkan token baru
											</button>
										)}
									</div>
								)}
							</div>
						</div>
					</div>

					<div className="flex items-start gap-3.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
							2
						</span>
						<div className="flex w-full flex-col gap-2.5">
							<div>
								<div className="text-xs font-semibold text-mist">
									Buka AI coding agent di repository kamu
								</div>
								<p className="text-[11px] leading-relaxed text-fog">
									Pastikan agent berjalan dari root folder project yang ingin
									dianalisis.
								</p>
							</div>
							<AiHarnessLogos className="pt-0.5" />
						</div>
					</div>

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
							preparation, and upload, all mapped from the same polled
							server status. */}
							<SyncStageList status={status} />

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
										<AlertCircle
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
						</div>
					</div>
				</div>

				{onContinueToSummary && (
					<div className="flex flex-col items-center justify-between gap-3 border-t border-graphite bg-charcoal/60 px-5 py-4 sm:flex-row sm:px-6">
						<p className="text-center text-[11px] leading-relaxed text-fog sm:text-left">
							{canAdvance
								? "Sinkronisasi selesai. Lanjutkan untuk melihat ringkasan codebase."
								: "Tombol lanjut aktif setelah sinkronisasi selesai."}
						</p>
						<button
							type="button"
							data-testid="sync-continue-to-summary"
							onClick={onContinueToSummary}
							disabled={!canAdvance}
							className="ml-auto inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-snow px-5 py-2 font-inter text-xs font-semibold text-onyx shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span>Lanjut ke Kesimpulan</span>
							<ArrowRight size={14} aria-hidden="true" />
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
