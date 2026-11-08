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
import { buildPromptRecoveryState } from "./prompt-recovery-state";

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
	/**
	 * The server genuinely failed this attempt. Only its presence is used: a
	 * recoverable prompt never routes through here, and no raw server message is
	 * shown, because the failure copy is fixed product wording.
	 */
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
	const cliActive = [
		"connected",
		"scanning",
		"filtering",
		"uploading",
	].includes(sessionStatus ?? "");
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

	// A schema-validated payload is the only proof that this session exists, so
	// it always wins. A credit read taken before (or after) it landed is stale by
	// definition and must never replace a live prompt with the lock that caused
	// the reported "locked prompt stays visible" blocker.
	const promptUsable =
		payload !== null &&
		expiryState !== "expired" &&
		!transportComplete &&
		!cliActive;
	const activeLock =
		promptUsable || transportComplete || cliActive ? null : lockedPrompt;

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
					{promptUsable && !activeLock && (
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
				<div
					data-testid="prompt-box"
					className="relative rounded-lg border border-graphite bg-onyx p-3.5 font-mono text-xs leading-relaxed text-mist sm:p-4"
				>
					{activeLock ? (
						<LockedPromptStateView {...activeLock} />
					) : promptUsable ? (
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
							className="flex items-center gap-2 font-sans"
						>
							<Icon icon={Tick01Icon} size={14} className="text-emerald-400" />
							<p className="text-xs leading-relaxed text-fog">
								Source code berhasil diterima.
							</p>
						</div>
					) : cliActive ? (
						<output className="block font-sans text-xs text-fog">
							Agent sedang menyinkronkan repository.
						</output>
					) : isStarting ? (
						<div className="flex items-center gap-2 font-sans text-xs text-fog">
							<Spinner size={14} className="text-blue-400" />
							<span>Menghubungkan repository...</span>
						</div>
					) : (
						<LockedPromptStateView
							{...buildPromptRecoveryState(
								// `error` is a genuine failure signal, never a recovery: a
								// recoverable prompt is owned by the recovery state instead.
								error
									? "failed"
									: sessionStatus === "expired" || expiryState === "expired"
										? "expired"
										: "unavailable",
								onRequestNewToken ?? null,
							)}
						/>
					)}
				</div>
				{creditNote && !activeLock && (
					<p className="text-[11px] leading-relaxed text-fog">{creditNote}</p>
				)}
			</div>
		</div>
	);
}
