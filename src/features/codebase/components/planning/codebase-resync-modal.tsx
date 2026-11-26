"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import { resolveCodebaseDisplayName } from "@/features/codebase/services/naming";
import {
	isResyncSessionVerified,
	resolveSyncStageView,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { cn } from "@/lib/utils";
import type { LockedPromptState } from "../workspace/locked-prompt-state";
import { ScreenConnectAgentStep } from "../workspace/screen-connect-agent-step";
import { ScreenConnectPromptStep } from "../workspace/screen-connect-prompt-step";
import { ScreenConnectSyncStep } from "../workspace/screen-connect-sync-step";

export interface CodebaseResyncModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectName: string;
	payload: SyncPromptPayload | null;
	isStarting?: boolean;
	/** A genuine session-creation failure; the only primary error this modal shows. */
	sessionError?: string | null;
	/** Runs the same request that failed, exactly once. */
	onRetrySession?: () => void;
	status: SyncStatusResponse | null;
	statusError?: string | null;
	/** Replaces a lost one-time prompt for the current attempt. */
	onReplacePrompt?: () => void;
	/** Retries a failed or expired attempt through the canonical session endpoint. */
	onRetrySync?: () => void;
	analysis?: AnalysisResponse | null;
	analysisError?: string | null;
	isAnalyzing?: boolean;
	onRetryAnalysis?: () => void;
	activeSessionId?: string | null;
}

/**
 * Re-sync presentation: a compact adaptation of the onboarding sync screen.
 *
 * Every block below is the onboarding block itself — the same prompt row,
 * agent step, and sync stage step — so the two flows cannot drift. The modal
 * only supplies its own approved copy and owns exactly one error (a failed
 * session request). Progress is never painted for a session other than the
 * attempt the prompt belongs to.
 */
export function CodebaseResyncModal({
	isOpen,
	onClose,
	projectName,
	payload,
	isStarting = false,
	sessionError = null,
	onRetrySession,
	status,
	statusError = null,
	onReplacePrompt,
	onRetrySync,
	analysis = null,
	analysisError = null,
	isAnalyzing = false,
	onRetryAnalysis,
	activeSessionId,
}: CodebaseResyncModalProps) {
	const resolvedRepositoryName =
		resolveCodebaseDisplayName(projectName) ?? "Repository belum terdeteksi";

	// Only the explicit attempt may supply progress; an unbound status is not recovery.
	const attemptSessionId = payload?.sessionId ?? activeSessionId ?? null;
	const attemptStatus =
		!isStarting &&
		!sessionError &&
		attemptSessionId &&
		status?.sessionId === attemptSessionId
			? status
			: null;
	const stageView = resolveSyncStageView(attemptStatus);
	const isVerified = isResyncSessionVerified({
		status: attemptStatus,
		activeSessionId: attemptSessionId,
	});

	const recoveryState: LockedPromptState | undefined = sessionError
		? {
				variant: "unavailable",
				title: "Sinkronisasi belum bisa dimulai.",
				action: onRetrySession ? (
					<Button
						type="button"
						variant="secondary"
						onClick={onRetrySession}
						disabled={isStarting}
						size="sm"
						className="min-h-8 px-3 text-xs"
					>
						Coba lagi
					</Button>
				) : undefined,
			}
		: undefined;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				data-testid="codebase-resync-panel"
				closeAriaLabel="Tutup sync ulang"
				className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 !p-0 outline-none sm:max-w-2xl"
			>
				<DialogHeader className="shrink-0 space-y-1 border-b border-graphite px-4 py-3.5 pr-12 text-left sm:px-5 sm:py-4">
					<DialogTitle className="font-inter text-base font-semibold text-snow sm:text-lg">
						Perbarui repository
					</DialogTitle>
					<DialogDescription className="text-xs leading-relaxed text-fog">
						{resolvedRepositoryName}
					</DialogDescription>
				</DialogHeader>

				{/* One scroll container for the steps; the prompt owns its own
				internal scroll because a long credential keeps its full text. */}
				<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3.5 pb-4 sm:px-5 sm:pt-4 sm:pb-5 flex flex-col">
					<ScreenConnectPromptStep
						key={payload?.sessionId ?? "no-session"}
						projectName={projectName}
						/* The prompt stays on screen after a verified re-sync: the
						credential belongs to the attempt the user just ran, and the
						progress rows below already report completion. */
						payload={isStarting || sessionError ? null : payload}
						isStarting={isStarting}
						status={attemptStatus}
						onRequestNewToken={onReplacePrompt}
						heading="Salin instruksi sync ulang"
						promptMode="resync"
						copyAriaLabel="Salin instruksi sync ulang"
						contentTestId="resync-prompt-content"
						recoveryState={recoveryState}
					/>

					<ScreenConnectAgentStep
						title="Jalankan di AI coding agent"
						description="Gunakan root repository yang sama."
						showHarnesses={true}
						hasConnector={true}
					/>

					<ScreenConnectSyncStep
						status={attemptStatus}
						stageView={stageView}
						canRetry={stageView.canRetry && Boolean(onRetrySync)}
						statusError={sessionError ? null : statusError}
						isStarting={isStarting}
						hasSession={Boolean(attemptSessionId)}
						onRetrySync={onRetrySync}
						canContinueToSummary={isVerified}
						analysis={analysis}
						analysisError={analysisError}
						isAnalyzing={isAnalyzing}
						onRetryAnalysis={onRetryAnalysis}
						isLegacyAnalysisMissingSuggestions={false}
						heading="Pantau sinkronisasi"
						description={null}
						idleLabel={sessionError ? "Belum dimulai" : "Menunggu agent"}
					/>
				</div>

				<DialogFooter className="shrink-0 flex items-center justify-end gap-2.5 border-t border-graphite px-4 py-3 sm:px-5 sm:py-3.5">
					{!isVerified && (
						<Button
							type="button"
							variant="secondary"
							onClick={onClose}
							size="sm"
							className="min-h-8 font-sans text-xs font-medium text-fog hover:text-snow"
						>
							Tutup
						</Button>
					)}
					<Button
						type="button"
						onClick={onClose}
						disabled={!isVerified}
						data-testid="resync-complete-button"
						aria-label={
							isVerified
								? "Selesai"
								: "Selesai (menunggu verifikasi sinkronisasi)"
						}
						size="sm"
						className={cn(
							"min-h-8 font-sans text-xs font-semibold transition-colors",
							isVerified
								? "bg-indigo text-snow hover:bg-indigo/90"
								: "border border-iron/60 bg-obsidian text-fog opacity-50 cursor-not-allowed",
						)}
					>
						Selesai
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
