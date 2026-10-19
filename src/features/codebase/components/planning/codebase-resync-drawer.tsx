"use client";

import {
	AlertCircleIcon,
	Cancel01Icon,
	Copy01Icon,
	Loading01Icon,
	RefreshIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import {
	buildAgentPrompt,
	resolveSyncStageView,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { copyToClipboard } from "@/features/codebase/utils/clipboard";
import { cn } from "@/lib/utils";
import { SyncStageList } from "../workspace/sync-stage-list";

interface CodebaseResyncDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	projectName: string;
	payload: SyncPromptPayload | null;
	isStarting?: boolean;
	status: SyncStatusResponse | null;
	statusError?: string | null;
	onRequestNewToken?: () => void;
	onRetrySync?: () => void;
	analysis?: AnalysisResponse | null;
	analysisError?: string | null;
	isAnalyzing?: boolean;
	onRetryAnalysis?: () => void;
}

export function CodebaseResyncDrawer({
	isOpen,
	onClose,
	projectName,
	payload,
	isStarting = false,
	status,
	statusError = null,
	onRequestNewToken,
	onRetrySync,
	analysis = null,
	analysisError = null,
	isAnalyzing = false,
	onRetryAnalysis,
}: CodebaseResyncDrawerProps) {
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
	const stageView = resolveSyncStageView(status);

	const handleCopy = async () => {
		if (!promptText) return;
		const result = await copyToClipboard(promptText);
		if (result.success) {
			setCopied(true);
			setCopyError(null);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
		} else {
			setCopied(false);
			setCopyError(
				result.error ??
					"Gagal menyalin otomatis. Silakan salin teks secara manual.",
			);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopyError(null), 4000);
		}
	};

	return (
		<DialogPrimitive.Root
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
				<DialogPrimitive.Content
					data-testid="codebase-resync-panel"
					className={cn(
						"fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-graphite bg-obsidian text-snow shadow-2xl outline-none duration-200",
						"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
					)}
				>
					{/* Header */}
					<div className="flex shrink-0 items-start justify-between border-b border-graphite p-5 sm:p-6">
						<div className="min-w-0 pr-4">
							<DialogPrimitive.Title className="font-inter text-base font-semibold text-snow sm:text-lg">
								Perbarui source code
							</DialogPrimitive.Title>
							<DialogPrimitive.Description className="mt-1 text-xs leading-relaxed text-fog">
								Jalankan perintah sinkronisasi dari root repository lokal kamu.
								Planning dan snapshot sebelumnya tetap tersimpan aman.
							</DialogPrimitive.Description>
						</div>
						<DialogPrimitive.Close
							className="rounded-md border border-graphite p-1.5 text-fog transition hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							aria-label="Tutup sync ulang"
						>
							<Icon icon={Cancel01Icon} size={16} aria-hidden />
						</DialogPrimitive.Close>
					</div>

					{/* Body */}
					<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5 sm:p-6">
						{/* Prompt section */}
						<div className="flex flex-col gap-2.5">
							<div className="flex items-center justify-between">
								<h3 className="text-xs font-semibold text-mist">
									Salin instruksi untuk AI agent
								</h3>
								{payload && (
									<button
										type="button"
										onClick={handleCopy}
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
								)}
							</div>

							<div className="relative rounded-lg border border-graphite bg-onyx p-3 sm:p-4">
								{payload ? (
									<>
										<div
											data-testid="resync-prompt-content"
											className="hide-scrollbar max-h-56 select-all overflow-x-auto overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-snow"
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
										<Icon
											icon={Loading01Icon}
											size={14}
											className="animate-spin text-blue-400"
										/>
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
												className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-iron bg-obsidian px-3.5 font-sans text-xs font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
											>
												<Icon icon={RefreshIcon} size={12} />
												<span>Dapatkan token baru</span>
											</button>
										)}
									</div>
								)}
							</div>
						</div>

						{/* Progress / Status section */}
						<div className="flex flex-col gap-2.5">
							<h3 className="text-xs font-semibold text-mist">
								Status sinkronisasi
							</h3>

							{statusError && (
								<p
									role="alert"
									className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-[11px] text-crimson"
								>
									{statusError}
								</p>
							)}

							{/* Real status list */}
							{stageView.hasStarted ? (
								<SyncStageList
									status={status}
									showAnalysisFailure={
										(Boolean(analysisError) ||
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
						</div>
					</div>

					{/* Footer */}
					<div className="flex shrink-0 items-center justify-between border-t border-graphite bg-charcoal/60 px-5 py-3 sm:px-6">
						<p className="text-[11px] text-slate">
							Drawer dapat ditutup tanpa membatalkan proses.
						</p>
						<button
							type="button"
							onClick={onClose}
							className="inline-flex min-h-8 items-center justify-center rounded-md border border-graphite bg-obsidian px-3.5 text-xs font-medium text-mist transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Tutup
						</button>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
