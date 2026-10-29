"use client";

import { Button } from "@/components/ui/button";
import type { RevisionProposalView } from "../revision/codebase-revision-review-dialog";

const TARGET_LABELS: Record<string, string> = {
	feature: "Feature Specification",
	prd: "PRD",
	ac: "Acceptance Criteria",
	tasks: "Task Breakdown",
};

export function CodebaseChatWorkspacePendingRevisionBanner({
	proposal,
	onOpenReview,
}: {
	proposal: RevisionProposalView | null | undefined;
	onOpenReview?: () => void;
}) {
	if (!proposal) return null;

	const targetLabel = TARGET_LABELS[proposal.targetKind] ?? proposal.targetKind;

	return (
		<div
			data-testid="codebase-revision-pending-card"
			className="p-3 rounded-lg border border-indigo/40 bg-indigo/10 flex items-center justify-between gap-3 text-xs"
		>
			<div className="min-w-0 flex-1">
				<span className="font-semibold text-snow block">
					Proposal Revisi {targetLabel} Siap Ditinjau
				</span>
				<span className="text-fog text-[11px] truncate block mt-0.5">
					"{proposal.instruction}"
				</span>
			</div>
			<Button
				type="button"
				size="sm"
				data-testid="codebase-review-revision-button"
				onClick={onOpenReview}
				className="shrink-0 bg-indigo text-white hover:bg-indigo/90 text-xs h-7 px-3"
			>
				Tinjau Revisi
			</Button>
		</div>
	);
}

export function CodebaseChatWorkspaceRevisionTargetSelector({
	selected,
	onChange,
}: {
	selected?: "feature" | "prd" | "ac" | "tasks";
	onChange?: (target: "feature" | "prd" | "ac" | "tasks") => void;
}) {
	const current = selected ?? "prd";
	const targets = [
		{ id: "prd", label: "PRD" },
		{ id: "ac", label: "Acceptance Criteria" },
		{ id: "feature", label: "Feature Spec" },
		{ id: "tasks", label: "Task Breakdown" },
	] as const;

	return (
		<div
			data-testid="codebase-revision-target-selector"
			className="flex items-center gap-1.5 mb-1.5 text-[11px] text-fog"
		>
			<span className="text-[10px] uppercase font-mono tracking-wider">
				Target:
			</span>
			{targets.map((t) => (
				<button
					key={t.id}
					type="button"
					onClick={() => onChange?.(t.id)}
					data-testid={`revision-target-${t.id}`}
					className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
						current === t.id
							? "bg-indigo/20 text-indigo-300 border-indigo/40 font-medium"
							: "bg-charcoal text-fog border-graphite hover:text-snow"
					}`}
				>
					{t.label}
				</button>
			))}
		</div>
	);
}
