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
import type { DiffLine } from "@/features/greenfield/utils/diff-utils";

export interface RevisionProposalView {
	id: string;
	targetKind: "feature" | "prd" | "ac" | "tasks";
	baseVersionId: string;
	instruction: string;
	baseContent: string;
	proposedContent: string;
	status: "pending" | "approved" | "rejected";
	impact: {
		prd?: "NEEDS_REVIEW";
		ac?: "NEEDS_REVIEW";
		tasks?: "NEEDS_REVIEW";
		reconciliation?: Array<{
			name: string;
			action:
				| "unchanged"
				| "added"
				| "modified"
				| "superseded"
				| "needs_review";
			reason?: string;
		}>;
		sections?: string[];
	};
	diff: DiffLine[];
}

const TARGET_LABELS: Record<string, string> = {
	feature: "Feature Specification",
	prd: "PRD",
	ac: "Acceptance Criteria",
	tasks: "Task Breakdown",
};

export function CodebaseRevisionReviewDialog({
	isOpen,
	onClose,
	proposal,
	isApplying,
	isRejecting,
	onApply,
	onReject,
	onRequestChanges,
}: {
	isOpen: boolean;
	onClose: () => void;
	proposal: RevisionProposalView | null;
	isApplying: boolean;
	isRejecting: boolean;
	onApply: () => void | Promise<void>;
	onReject: () => void | Promise<void>;
	onRequestChanges?: () => void;
}) {
	if (!proposal) return null;

	const targetLabel = TARGET_LABELS[proposal.targetKind] ?? proposal.targetKind;
	const reconciliation = proposal.impact.reconciliation ?? [];
	const hasDownstreamImpact =
		proposal.impact.prd || proposal.impact.ac || proposal.impact.tasks;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="max-w-2xl max-h-[85vh] flex flex-col bg-charcoal border-graphite text-snow p-0 overflow-hidden"
				data-testid="codebase-revision-review-dialog"
			>
				<DialogHeader className="p-4 border-b border-graphite shrink-0">
					<div className="flex items-center justify-between gap-2">
						<DialogTitle className="text-base font-semibold text-snow">
							Revisi {targetLabel}
						</DialogTitle>
						<span className="text-xs font-mono text-fog px-2 py-0.5 rounded border border-graphite bg-obsidian">
							{proposal.baseVersionId} → baru
						</span>
					</div>
					<DialogDescription className="text-xs text-fog text-left mt-1">
						Instruksi: "{proposal.instruction}"
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 text-xs">
					{/* Changed Sections if available */}
					{proposal.impact.sections && proposal.impact.sections.length > 0 && (
						<div>
							<span className="text-[11px] font-medium text-fog uppercase tracking-wider block mb-1.5">
								Bagian yang Diperbarui ({proposal.impact.sections.length})
							</span>
							<div className="flex flex-wrap gap-1.5">
								{proposal.impact.sections.map((section) => (
									<span
										key={section}
										className="px-2 py-0.5 rounded bg-graphite/50 border border-graphite text-fog font-mono text-[11px]"
									>
										{section}
									</span>
								))}
							</div>
						</div>
					)}

					{/* Task Reconciliation Table if tasks target */}
					{reconciliation.length > 0 && (
						<div>
							<span className="text-[11px] font-medium text-fog uppercase tracking-wider block mb-1.5">
								Rekonsiliasi Tugas ({reconciliation.length})
							</span>
							<div className="rounded border border-graphite bg-obsidian divide-y divide-graphite/60 overflow-hidden">
								{reconciliation.map((item) => (
									<div
										key={item.name}
										className="p-2 flex items-center justify-between gap-2 text-xs"
									>
										<div className="min-w-0 flex-1">
											<span className="font-medium text-snow truncate block">
												{item.name}
											</span>
											{item.reason && (
												<span className="text-[10px] text-fog block">
													{item.reason}
												</span>
											)}
										</div>
										<span
											className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-[10px] uppercase font-semibold ${
												item.action === "added"
													? "bg-emerald/15 text-emerald border border-emerald/30"
													: item.action === "modified"
														? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
														: item.action === "needs_review"
															? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
															: "bg-graphite text-fog"
											}`}
										>
											{item.action}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Diff Viewer */}
					<div>
						<span className="text-[11px] font-medium text-fog uppercase tracking-wider block mb-1.5">
							Perubahan Dokumen
						</span>
						<div className="font-mono text-xs rounded border border-graphite bg-obsidian p-3 max-h-72 overflow-y-auto space-y-0.5 select-text">
							{proposal.diff.map((line, idx) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: lines in diff are positional
									key={idx}
									className={`whitespace-pre-wrap ${
										line.type === "added"
											? "text-emerald bg-emerald/10 px-1 rounded-sm"
											: line.type === "removed"
												? "text-crimson bg-crimson/10 px-1 rounded-sm line-through"
												: "text-fog"
									}`}
								>
									{line.type === "added"
										? "+ "
										: line.type === "removed"
											? "- "
											: "  "}
									{line.text}
								</div>
							))}
						</div>
					</div>

					{/* Downstream Impact */}
					<div className="p-3 rounded border border-graphite bg-obsidian/60 space-y-2">
						<span className="text-[11px] font-medium text-fog uppercase tracking-wider block">
							Dampak Perubahan
						</span>
						{hasDownstreamImpact ? (
							<div className="space-y-1.5">
								{proposal.impact.prd && (
									<div className="flex items-center justify-between text-xs">
										<span className="text-snow">
											Product Requirements (PRD)
										</span>
										<span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">
											Perlu ditinjau
										</span>
									</div>
								)}
								{proposal.impact.ac && (
									<div className="flex items-center justify-between text-xs">
										<span className="text-snow">Acceptance Criteria</span>
										<span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">
											Perlu ditinjau
										</span>
									</div>
								)}
								{proposal.impact.tasks && (
									<div className="flex items-center justify-between text-xs">
										<span className="text-snow">Task Breakdown</span>
										<span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">
											Perlu ditinjau
										</span>
									</div>
								)}
							</div>
						) : (
							<span className="text-xs text-fog">
								Tidak ada dokumen downstream yang perlu ditinjau.
							</span>
						)}
					</div>
				</div>

				<DialogFooter className="p-3 border-t border-graphite bg-obsidian flex items-center justify-between gap-2 shrink-0 sm:justify-between">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onReject}
							disabled={isRejecting || isApplying}
							className="text-xs text-crimson hover:text-crimson/80 border-graphite"
						>
							{isRejecting ? "Menolak..." : "Tolak"}
						</Button>
						{onRequestChanges && (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={onRequestChanges}
								disabled={isRejecting || isApplying}
								className="text-xs border-graphite"
							>
								Minta Perubahan
							</Button>
						)}
					</div>
					<Button
						type="button"
						size="sm"
						onClick={onApply}
						disabled={isApplying || isRejecting}
						className="text-xs bg-indigo text-white hover:bg-indigo/90"
					>
						{isApplying ? "Menerapkan..." : "Terapkan Revisi"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
