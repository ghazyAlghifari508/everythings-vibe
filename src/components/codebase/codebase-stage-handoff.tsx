"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import {
	type CodebaseArtifactRef,
	CodebaseFileCard,
} from "./codebase-file-card";

/**
 * The artifact a finished stage produced, plus the file the user can open.
 * `null` while the artifact is not confirmed persisted — a stage never claims
 * a file exists before the server has it.
 */
export interface StageOutcome {
	/** Settled stage headline, e.g. "PRD selesai". */
	title: string;
	artifact: CodebaseArtifactRef | null;
}

interface CodebaseStageHandoffProps {
	outcome: StageOutcome;
	/** What the next stage produces, e.g. "Acceptance Criteria". */
	nextLabel: string;
	/** One sentence explaining what the next request does. */
	nextDescription: string;
	/** CTA label, e.g. "Buat AC". */
	actionLabel: string;
	/** Label while the next request runs, e.g. "Menyusun AC...". */
	busyLabel: string;
	busy?: boolean;
	/** False when the action cannot run yet; the CTA is disabled, not hidden. */
	actionEnabled?: boolean;
	/** Why the action is unavailable; shown next to the disabled CTA. */
	actionBlockedReason?: string | null;
	testId: string;
	onAction: () => void;
	onOpenArtifact?: (artifact: CodebaseArtifactRef) => void;
	onDownloadArtifact?: (artifact: CodebaseArtifactRef) => void;
	/** Extra controls rendered beside the CTA, e.g. "Buka Kanban Penuh". */
	secondaryAction?: ReactNode;
}

/**
 * The transition between two pipeline stages, rendered as one conversational
 * block instead of a large card: the finished artifact, then the next request
 * and its single CTA. The artifact card is the same FileCard used in the chat
 * stream, so a stage result looks identical wherever it appears.
 */
export function CodebaseStageHandoff({
	outcome,
	nextLabel,
	nextDescription,
	actionLabel,
	busyLabel,
	busy = false,
	actionEnabled = true,
	actionBlockedReason = null,
	testId,
	onAction,
	onOpenArtifact,
	onDownloadArtifact,
	secondaryAction,
}: CodebaseStageHandoffProps) {
	return (
		<div data-testid={testId} className="flex flex-col gap-2.5">
			<p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald">
				<span aria-hidden="true">✓</span>
				{outcome.title}
			</p>
			{outcome.artifact ? (
				<CodebaseFileCard
					artifact={outcome.artifact}
					onOpen={onOpenArtifact}
					onDownload={onDownloadArtifact}
				/>
			) : null}
			<div className="rounded-xl border border-graphite bg-obsidian p-3">
				<p className="text-[11px] font-semibold uppercase tracking-wider text-fog">
					Berikutnya: {nextLabel}
				</p>
				<p className="mt-1 text-xs leading-5 text-fog">{nextDescription}</p>
				<div className="mt-3 flex flex-wrap items-center justify-end gap-2">
					{secondaryAction}
					{actionBlockedReason ? (
						<p className="mr-auto text-[11px] leading-4 text-crimson">
							{actionBlockedReason}
						</p>
					) : null}
					<button
						type="button"
						disabled={busy || !actionEnabled}
						onClick={onAction}
						className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{busy ? busyLabel : actionLabel}
						{!busy ? <ArrowRight size={13} aria-hidden="true" /> : null}
					</button>
				</div>
			</div>
		</div>
	);
}
