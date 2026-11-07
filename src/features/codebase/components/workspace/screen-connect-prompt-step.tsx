"use client";

import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { useCopyFeedback } from "@/features/codebase/hooks/use-copy-feedback";
import {
	buildAgentPrompt,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { CODEBASE_SYNC_EXPIRY_SOON_MS } from "@/features/codebase/types/codebase-constants";
import {
	type LockedPromptState,
	LockedPromptStateView,
} from "./locked-prompt-state";

function resolveExpiryMs(value: string | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) return null;
	return ms - Date.now();
}

interface ScreenConnectPromptStepProps {
	projectName: string;
	payload: SyncPromptPayload | null;
	isStarting: boolean;
	status?: SyncStatusResponse | null;
	/**
	 * The server persisted a snapshot, so the CLI already ran. A replacement
	 * credential would be a second upload for an upload that already succeeded —
	 * exactly the mixed state the user reported — so the prompt row states the
	 * transport is done instead of offering a new session.
	 */
	transportComplete?: boolean;
	onRequestNewToken?: () => void;
	lockedPrompt?: LockedPromptState | null;
	/** Non-secret rate/saldo disclosure rendered outside the prompt box. */
	creditNote?: string | null;
	error?: string | null;
}

export function ScreenConnectPromptStep({
	projectName,
	payload,
	isStarting,
	status,
	transportComplete = false,
	onRequestNewToken,
	lockedPrompt = null,
	creditNote = null,
	error = null,
}: ScreenConnectPromptStepProps) {
	const { copied, copyError, copy } = useCopyFeedback();
	const promptText = payload ? buildAgentPrompt(payload, { projectName }) : "";
	const sessionStatus = status?.status ?? null;
	const expiryMs = resolveExpiryMs(payload?.expiresAt ?? status?.expiresAt);
	const expiryState =
		sessionStatus === "expired" || expiryMs === null || expiryMs <= 0
			? "expired"
			: expiryMs <= CODEBASE_SYNC_EXPIRY_SOON_MS
				? "soon"
				: "valid";
	const [, forceTick] = useState(0);
	useEffect(() => {
		if (expiryState !== "soon" && expiryState !== "valid") return;
		const timer = setInterval(() => forceTick((n) => n + 1), 15000);
		return () => clearInterval(timer);
	}, [expiryState]);

	const handleCopy = async () => {
		await copy(promptText);
	};

	const showRenewal =
		expiryState === "expired" || expiryState === "soon" || !payload;

	// A schema-validated payload is the only proof that this session exists, so
	// it always wins. A credit read taken before (or after) it landed is stale by
	// definition and must never replace a live prompt with the lock that caused
	// the reported "locked prompt stays visible" blocker.
	const promptUsable = payload !== null && expiryState !== "expired";
	const activeLock = promptUsable ? null : lockedPrompt;

	return (
		<div className="flex items-start gap-3.5">
			<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
				1
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex items-center justify-between gap-3">
					<div className="text-xs font-semibold text-mist">
						Salin instruksi untuk AI agent
					</div>
					{payload && expiryState !== "expired" && !activeLock && (
						<Button
							type="button"
							onClick={handleCopy}
							aria-label="Salin prompt untuk AI agent"
							variant="secondary"
							className="min-h-11 shrink-0 gap-1.5 px-3 text-xs"
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
									<span>Salin</span>
								</>
							)}
						</Button>
					)}
				</div>
				<div className="relative rounded-lg border border-graphite bg-onyx p-3.5 font-mono text-xs leading-relaxed text-mist sm:p-4">
					{activeLock ? (
						<LockedPromptStateView {...activeLock} />
					) : payload && expiryState !== "expired" ? (
						<>
							<div className="hide-scrollbar max-h-56 select-all overflow-x-auto overflow-y-auto whitespace-pre-wrap text-snow">
								{promptText}
							</div>
							{copyError && (
								<p className="mt-2 font-sans text-[11px] text-crimson">
									{copyError}
								</p>
							)}
							{expiryState === "soon" && (
								<p className="mt-2 font-sans text-[11px] text-amber-400">
									Sesi segera berakhir. Salin dan jalankan prompt sekarang, atau
									perbarui sesi.
								</p>
							)}
						</>
					) : transportComplete ? (
						<div
							data-testid="prompt-transport-done"
							className="flex min-h-[190px] flex-col items-center justify-center gap-2 py-6 text-center font-sans"
						>
							<Icon icon={Tick01Icon} size={14} className="text-emerald-400" />
							<p className="max-w-[38ch] text-xs leading-relaxed text-fog">
								Prompt sudah dijalankan dan source code tersimpan. Tidak ada
								instruksi baru yang perlu dijalankan.
							</p>
						</div>
					) : isStarting ? (
						<div className="flex min-h-[190px] items-center justify-center gap-2 py-6 font-sans text-xs text-fog">
							<Spinner size={14} className="text-blue-400" />
							<span>Menghubungkan repository...</span>
						</div>
					) : (
						<div className="flex min-h-[190px] flex-col items-center justify-center gap-3 py-6 text-center font-sans">
							<p className="max-w-[38ch] text-xs text-fog">
								{error ??
									(sessionStatus === "expired" || expiryState === "expired"
										? "Sesi telah berakhir."
										: "Token sync hanya berlaku sekali dan tidak disimpan di browser.")}
							</p>
							{showRenewal && onRequestNewToken && (
								<Button
									type="button"
									onClick={onRequestNewToken}
									disabled={isStarting}
									variant="secondary"
									className="min-h-11 px-3.5 text-xs"
								>
									{expiryState === "expired" || !payload
										? error
											? "Coba lagi"
											: "Buat sesi baru"
										: expiryState === "soon"
											? "Perbarui sesi"
											: "Dapatkan token baru"}
								</Button>
							)}
						</div>
					)}
				</div>
				{creditNote && !activeLock && (
					<p className="text-[11px] leading-relaxed text-fog">{creditNote}</p>
				)}
			</div>
		</div>
	);
}
