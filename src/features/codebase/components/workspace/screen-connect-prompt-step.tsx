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
import { cn } from "@/lib/utils";
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
	/** Step title. The re-sync modal names its own prompt action. */
	heading?: string;
	/** Which prompt document to build for the copied credential. */
	promptMode?: "initial" | "resync";
	/** Accessible name for the copy affordance. */
	copyAriaLabel?: string;
	/** Stable test hook for the scrollable prompt content. */
	contentTestId?: string;
	/**
	 * Replaces the default recovery block (states A/B/E) when the caller owns
	 * the approved wording for its own flow. The prompt box, copy affordance,
	 * and one-time-credential rules stay identical.
	 */
	recoveryState?: LockedPromptState;
	/** Vertical line connector extending to next step. */
	hasConnector?: boolean;
}

export function ScreenConnectPromptStep({
	projectName,
	payload,
	isStarting,
	status,
	onRequestNewToken,
	lockedPrompt = null,
	creditNote: _creditNote = null,
	error = null,
	heading = "Salin instruksi untuk AI agent",
	promptMode = "initial",
	copyAriaLabel = "Salin prompt untuk AI agent",
	contentTestId,
	recoveryState,
	hasConnector = true,
}: ScreenConnectPromptStepProps) {
	const { copied, copyError, copy } = useCopyFeedback();
	const promptText = payload
		? buildAgentPrompt(payload, { projectName, mode: promptMode })
		: "";
	const sessionStatus = status?.status ?? null;
	const expiryRaw = payload?.expiresAt ?? status?.expiresAt;
	const expiryMs = resolveExpiryMs(expiryRaw);
	const hasExpiry = Boolean(expiryRaw);
	const expiryState =
		sessionStatus === "expired" ||
		(hasExpiry && (expiryMs === null || expiryMs <= 0))
			? "expired"
			: expiryMs !== null && expiryMs <= CODEBASE_SYNC_EXPIRY_SOON_MS
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
	//
	// Sync progress deliberately does NOT participate: starting, connecting,
	// uploading, and finishing the upload are all states of the same prompt, so
	// the prompt box keeps the exact credential (and its scroll position and
	// size) it was handed. Only a credential that the server would now reject —
	// an expired token, or a terminal session — stops being usable, and that case
	// routes through the existing renewal state instead of a generic success
	// message.
	const promptUsable =
		payload !== null &&
		expiryState !== "expired" &&
		sessionStatus !== "failed" &&
		sessionStatus !== "expired";
	// A replacement credential must never be offered while the CLI is genuinely
	// mid-sync: the token it is using is the one on screen (or was), so minting
	// another would rotate a credential out from under a live upload. The owner
	// already clears its own recovery for that state; this is the second line of
	// defence at the surface the user actually reads.
	const cliInFlight = [
		"connected",
		"scanning",
		"filtering",
		"uploading",
	].includes(sessionStatus ?? "");
	const activeLock = promptUsable || cliInFlight ? null : lockedPrompt;

	return (
		<div className="flex items-stretch gap-3.5">
			<div className="flex w-6 shrink-0 flex-col items-center">
				<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
					1
				</span>
				{hasConnector && (
					<div
						data-testid="step-connector-1"
						className="mt-2 w-px flex-1 bg-graphite/40"
						aria-hidden="true"
					/>
				)}
			</div>
			<div
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-2",
					hasConnector && "pb-6",
				)}
			>
				<div className="flex items-center justify-between gap-3">
					<div className="text-xs font-semibold text-mist">{heading}</div>
					{promptUsable && !activeLock && (
						<Button
							type="button"
							onClick={handleCopy}
							aria-label={copyAriaLabel}
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
							<div
								data-testid={contentTestId}
								className="hide-scrollbar max-h-56 select-all overflow-x-auto overflow-y-auto whitespace-pre-wrap text-snow"
							>
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
					) : status?.snapshotId ? (
						<div
							data-testid="prompt-completed"
							className="flex flex-col items-start gap-1 font-sans text-xs leading-relaxed"
						>
							<p className="font-semibold text-snow">Sinkronisasi selesai.</p>
							<p className="text-fog">
								Snapshot repository telah berhasil dibuat.
							</p>
						</div>
					) : cliInFlight ? (
						<div
							data-testid="prompt-unavailable"
							className="flex flex-col items-start gap-1 font-sans text-xs leading-relaxed"
						>
							<p className="font-semibold text-snow">
								Repository sedang disinkronkan.
							</p>
							<p className="text-fog">Pantau progresnya di bawah.</p>
						</div>
					) : isStarting ? (
						<div className="flex items-center gap-2 font-sans text-xs text-fog">
							<Spinner size={14} className="text-blue-400" />
							<span>
								{promptMode === "resync"
									? "Menyiapkan instruksi sync ulang..."
									: "Menyiapkan instruksi sync..."}
							</span>
						</div>
					) : (
						<LockedPromptStateView
							{...(recoveryState ??
								buildPromptRecoveryState(
									error
										? "failed"
										: sessionStatus === "expired" ||
												(hasExpiry && expiryState === "expired")
											? "expired"
											: "unavailable",
									onRequestNewToken ?? null,
								))}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
