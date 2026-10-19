"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import {
	type CodebaseArtifactRef,
	CodebaseFileCard,
} from "../explorer/codebase-file-card";

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
 * The transition between two pipeline stages, rendered as a compact conversational
 * block without large bordered cards: settled outcome, persisted artifact, and the
 * next conversational CTA.
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
		<div data-testid={testId} className="flex flex-col gap-2 py-1">
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
			<div className="flex flex-col gap-1 pt-0.5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<span className="text-xs text-fog">
						<span className="font-medium text-snow/90">Berikutnya:</span>{" "}
						{nextLabel}
					</span>
					<div className="flex flex-wrap items-center gap-2">
						{secondaryAction}
						{actionBlockedReason ? (
							<p className="text-[11px] leading-4 text-crimson">
								{actionBlockedReason}
							</p>
						) : null}
						<button
							type="button"
							disabled={busy || !actionEnabled}
							onClick={onAction}
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-snow px-3 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							{busy ? busyLabel : actionLabel}
							{!busy ? (
								<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
							) : null}
						</button>
					</div>
				</div>
				<p className="text-[11.5px] leading-relaxed text-fog/80">
					{nextDescription}
				</p>
			</div>
		</div>
	);
}
