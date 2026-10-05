"use client";

import { Check, Circle, Copy, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buildAgentPrompt, type SyncPromptPayload } from "@/lib/codebase-sync";
import { AiHarnessLogos } from "./ai-harness-logos";

interface ScreenConnectProps {
	projectName: string;
	payload: SyncPromptPayload | null;
	isStarting?: boolean;
	hideFooter?: boolean;
	nextLabel?: string;
	/**
	 * Whether the server has evidence the CLI actually started this sync
	 * attempt (`canContinueToSync` over the last polled status).
	 *
	 * This is the ONLY thing that unlocks the next step. Copying the prompt is
	 * browser-local feedback and proves nothing about whether the agent ran, so
	 * it deliberately has no influence here.
	 */
	canContinue?: boolean;
	onAgentStarted?: () => void;
}

export function ScreenConnect({
	projectName,
	payload,
	isStarting = false,
	hideFooter = false,
	nextLabel = "Lanjut ke Pantau Sync",
	canContinue = false,
	onAgentStarted,
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
	const agentConnected = canContinue && payload !== null;
	const canAdvance = agentConnected && !isStarting;

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
			{/* Modal-style Container from existing-codebase-flow.html */}
			<div className="mx-auto w-full max-w-2xl rounded-xl border border-iron bg-obsidian/90 shadow-2xl backdrop-blur-xl overflow-hidden">
				{/* Modal Head */}
				<div className="border-b border-graphite p-5 sm:p-6">
					<h2 className="font-inter text-lg sm:text-xl font-[600] text-snow">
						Sync codebase dengan VibeEverything
					</h2>
					<p className="mt-1.5 text-xs sm:text-sm text-fog leading-relaxed">
						Salin prompt ini dan paste ke Claude Code, Cursor, Windsurf, atau AI
						agent lain dari root repository kamu.
					</p>
				</div>

				{/* Modal Body */}
				<div className="p-5 sm:p-6 flex flex-col gap-6">
					{/* Step 1 */}
					<div className="flex items-start gap-3.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron text-xs font-mono text-mist">
							1
						</span>
						<div className="flex flex-1 flex-col gap-2">
							<div className="text-xs font-semibold text-mist">
								Copy prompt untuk AI agent
							</div>
							<div className="relative rounded-lg border border-graphite bg-onyx p-3.5 sm:p-4 text-xs font-mono leading-relaxed text-mist min-h-[90px]">
								{payload ? (
									<>
										<button
											type="button"
											onClick={handleCopy}
											className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded border border-iron bg-obsidian px-2.5 py-1 text-[11px] font-sans text-fog hover:text-snow transition hover:bg-steel"
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
										<div className="pr-16 max-h-48 overflow-y-auto hide-scrollbar whitespace-pre-wrap select-all text-snow">
											{promptText}
										</div>
										{copyError && (
											<p className="mt-2 text-[11px] text-crimson font-sans">
												{copyError}
											</p>
										)}
									</>
								) : isStarting ? (
									<div className="flex items-center justify-center gap-2 py-6 text-xs text-fog font-sans">
										<Loader2 size={14} className="animate-spin text-blue-400" />
										<span>Menyiapkan token sesi...</span>
									</div>
								) : (
									<div className="flex items-center justify-center py-6 text-xs text-fog font-sans">
										<span>Prompt sync belum tersedia.</span>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Step 2 */}
					<div className="flex items-start gap-3.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron text-xs font-mono text-mist">
							2
						</span>
						<div className="flex flex-col gap-2.5 w-full">
							<div>
								<div className="text-xs font-semibold text-mist">
									Buka AI coding agent di repository kamu
								</div>
								<p className="text-[11px] text-fog leading-relaxed">
									Pastikan agent berjalan dari root folder project yang ingin
									dianalisis.
								</p>
							</div>
							<AiHarnessLogos className="pt-0.5" />
						</div>
					</div>

					{/* Step 3 */}
					<div className="flex items-start gap-3.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron text-xs font-mono text-mist">
							3
						</span>
						<div className="flex flex-col gap-2">
							<div className="text-xs font-semibold text-mist">
								Paste prompt lalu jalankan
							</div>
							<p className="text-[11px] text-fog leading-relaxed">
								{agentConnected
									? "VibeEverything sudah menerima koneksi dari agent. Buka Pantau Sync untuk melihat progress pengiriman file."
									: "VibeEverything mendeteksi koneksi agent otomatis. Halaman ini akan berubah sendiri begitu agent terhubung."}
							</p>
							{/* The single live handshake indicator: it mirrors the polled
						server status, so it can only ever report what the server
						actually observed. */}
							<div
								data-testid="prompt-agent-connection"
								data-connected={agentConnected ? "true" : "false"}
								className={`flex items-start gap-2.5 rounded-md border p-3 text-[11px] ${
									agentConnected
										? "border-emerald-500/25 bg-emerald-500/10 text-mist"
										: "border-graphite bg-obsidian/70 text-fog"
								}`}
							>
								<span className="mt-0.5 shrink-0">
									{agentConnected ? (
										<Check
											size={14}
											className="font-bold text-emerald-600 dark:text-emerald-400"
											aria-hidden="true"
										/>
									) : (
										<Circle
											size={14}
											className="shrink-0 fill-amber-400/30 text-amber-400/90"
											aria-hidden="true"
										/>
									)}
								</span>
								<span className="flex flex-col gap-0.5">
									<span className="font-semibold text-snow">
										{agentConnected
											? "Agent terhubung"
											: "Menunggu agent terhubung"}
									</span>
									<span className="leading-relaxed opacity-80">
										{agentConnected
											? "Repository berhasil terdeteksi."
											: "Jalankan prompt dari root repository."}
									</span>
								</span>
							</div>
						</div>
					</div>
				</div>

				{/* Modal Foot */}
				{!hideFooter && onAgentStarted && (
					<div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-graphite bg-charcoal/60 px-5 py-4 sm:px-6">
						<p className="text-[11px] text-fog leading-relaxed text-center sm:text-left">
							{agentConnected
								? "Agent sudah terhubung. Buka Pantau Sync untuk memantau pengiriman source code."
								: "Tombol lanjut aktif setelah agent benar-benar terhubung ke VibeEverything."}
						</p>
						<button
							type="button"
							data-testid="prompt-continue-to-sync"
							onClick={onAgentStarted}
							disabled={!canAdvance}
							className="inline-flex items-center justify-center shrink-0 rounded-md bg-snow px-5 py-2 font-inter text-xs font-semibold text-onyx shadow-sm hover:brightness-110 transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ml-auto"
						>
							{nextLabel}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
