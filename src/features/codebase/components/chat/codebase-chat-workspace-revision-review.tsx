"use client";

import type { RevisionProposalView } from "../revision/codebase-revision-review-dialog";
import { CodebaseRevisionReviewDialog } from "../revision/codebase-revision-review-dialog";

/**
 * The review surface, wired so the third action behaves like the contract says:
 * "Minta Perubahan" supersedes the proposal first, then hands its instruction
 * back to the composer for amendment. The dialog itself stays presentational.
 */
export function CodebaseRevisionReview({
	isOpen,
	proposal,
	isApplying,
	isRejecting,
	onClose,
	onApply,
	onReject,
	onRequestChanges,
	onPrefillDraft,
}: {
	isOpen: boolean;
	proposal: RevisionProposalView | null;
	isApplying: boolean;
	isRejecting: boolean;
	onClose: () => void;
	onApply: () => void | Promise<void>;
	onReject: () => void | Promise<void>;
	onRequestChanges?: () => Promise<string | null>;
	onPrefillDraft: (text: string) => void;
}) {
	return (
		<CodebaseRevisionReviewDialog
			isOpen={isOpen}
			onClose={onClose}
			proposal={proposal}
			isApplying={isApplying}
			isRejecting={isRejecting}
			onApply={onApply}
			onReject={onReject}
			onRequestChanges={
				onRequestChanges
					? async () => {
							const instruction = await onRequestChanges();
							if (instruction) onPrefillDraft(instruction);
						}
					: undefined
			}
		/>
	);
}
