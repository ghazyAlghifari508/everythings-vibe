"use client";

import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import { resolveCodebaseDisplayName } from "@/features/codebase/services/naming";
import {
	resolveSyncStageView,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { ScreenConnectAgentStep } from "./screen-connect-agent-step";
import { ScreenConnectPromptStep } from "./screen-connect-prompt-step";
import { ScreenConnectSummaryFooter } from "./screen-connect-summary-footer";
import { ScreenConnectSyncStep } from "./screen-connect-sync-step";

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
	analysis?: AnalysisResponse | null;
	analysisError?: string | null;
	isAnalyzing?: boolean;
	onRetryAnalysis?: () => void;
	isLegacyAnalysisMissingSuggestions?: boolean;
	onRefreshLegacySuggestions?: () => void;
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
	analysis = null,
	analysisError = null,
	isAnalyzing = false,
	onRetryAnalysis,
	isLegacyAnalysisMissingSuggestions = false,
	onRefreshLegacySuggestions,
}: ScreenConnectProps) {
	// A provisional creation name is storage-only: the eyebrow shows neutral
	// copy until the CLI handshake reports the real repository folder name.
	const displayName =
		resolveCodebaseDisplayName(projectName) ?? "Repository belum terdeteksi";
	const stageView = resolveSyncStageView(status);
	const canAdvance =
		canContinueToSummary && !isStarting && Boolean(onContinueToSummary);
	const canRetry = stageView.canRetry && Boolean(onRetrySync);

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
						Sync codebase dengan everythings-vibe
					</h2>
					<p className="mt-1.5 text-xs leading-relaxed text-fog sm:text-sm">
						Salin prompt ini dan paste ke Claude Code, Cursor, Windsurf, atau AI
						agent lain dari root repository kamu.
					</p>
				</div>

				<div className="flex flex-col gap-6 p-5 sm:p-6">
					<ScreenConnectPromptStep
						projectName={projectName}
						payload={payload}
						isStarting={isStarting}
						onRequestNewToken={onRequestNewToken}
					/>

					<ScreenConnectAgentStep />

					<ScreenConnectSyncStep
						status={status}
						stageView={stageView}
						canRetry={canRetry}
						statusError={statusError}
						isStarting={isStarting}
						onRetrySync={onRetrySync}
						canContinueToSummary={canContinueToSummary}
						analysis={analysis}
						analysisError={analysisError}
						isAnalyzing={isAnalyzing}
						onRetryAnalysis={onRetryAnalysis}
						isLegacyAnalysisMissingSuggestions={
							isLegacyAnalysisMissingSuggestions
						}
						onRefreshLegacySuggestions={onRefreshLegacySuggestions}
					/>
				</div>

				{onContinueToSummary && (
					<ScreenConnectSummaryFooter
						canAdvance={canAdvance}
						isLegacyAnalysisMissingSuggestions={
							isLegacyAnalysisMissingSuggestions
						}
						onContinueToSummary={onContinueToSummary}
					/>
				)}
			</div>
		</div>
	);
}
