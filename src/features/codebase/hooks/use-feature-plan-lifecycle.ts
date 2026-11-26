"use client";

import { useCallback, useMemo, useState } from "react";
import type { ActivePlanCandidate } from "@/features/codebase/services/active-plan";
import { featurePlanMutations } from "@/features/codebase/services/feature-plan-mutations-client";
import { clearActivePlanPointer } from "@/features/codebase/services/plan-storage";

/**
 * Drives the server-backed lifecycle of one repository's feature plans:
 * rename, archive/unarchive, and permanent delete, plus the destructive
 * confirmation and rename dialogs they need.
 *
 * Every mutation posts to the feature-scoped route and, on success, hands the
 * server's authoritative result to the workspace's plan overlay
 * (`applyPlanMutation` / `removePlan`), so the plan list, active resolution and
 * switcher sections reflect exactly what the backend accepted — never a
 * locally-invented optimistic copy. A failed mutation surfaces the server's
 * message and changes nothing.
 *
 * Deleting the active plan clears the stored active pointer before the overlay
 * update, then reports the deletion so the parent can steer selection to a
 * surviving feature (or the create-new flow when none remain). Deleting the
 * durable onboarding anchor is refused server-side and reported here as an
 * error, never applied optimistically.
 */
export function useFeaturePlanLifecycle({
	codebaseId,
	applyPlanMutation,
	removePlan,
	onDeleted,
}: {
	codebaseId: string;
	/** Apply one authoritative rename/archive result to the workspace plan list. */
	applyPlanMutation: (
		projectId: string,
		patch: Partial<ActivePlanCandidate>,
	) => void;
	/** Remove one deleted feature from the workspace plan list. */
	removePlan: (projectId: string) => void;
	/** Called after a confirmed delete so the parent can reconcile selection. */
	onDeleted?: (deletedPlanId: string) => void;
}) {
	const [renameTarget, setRenameTarget] = useState<ActivePlanCandidate | null>(
		null,
	);
	const [renameDraft, setRenameDraft] = useState("");
	const [renameError, setRenameError] = useState<string | null>(null);
	const [renameBusy, setRenameBusy] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<ActivePlanCandidate | null>(
		null,
	);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);

	const openRename = useCallback((plan: ActivePlanCandidate) => {
		setRenameError(null);
		setRenameDraft(plan.name);
		setRenameTarget(plan);
	}, []);
	const closeRename = useCallback(() => {
		setRenameTarget(null);
		setRenameError(null);
	}, []);

	const openDelete = useCallback((plan: ActivePlanCandidate) => {
		setDeleteError(null);
		setDeleteTarget(plan);
	}, []);
	const closeDelete = useCallback(() => {
		setDeleteTarget(null);
		setDeleteError(null);
	}, []);

	const submitRename = useCallback(async () => {
		if (!renameTarget) return;
		setRenameBusy(true);
		setRenameError(null);
		try {
			const result = await featurePlanMutations.rename(
				codebaseId,
				renameTarget.id,
				renameDraft,
			);
			if (!result.ok) {
				setRenameError(result.error ?? "Gagal mengganti nama fitur.");
				return;
			}
			// Authoritative: the server echoed back the accepted name.
			applyPlanMutation(renameTarget.id, { name: result.name ?? renameDraft });
			closeRename();
		} finally {
			setRenameBusy(false);
		}
	}, [codebaseId, renameDraft, renameTarget, closeRename, applyPlanMutation]);

	const toggleArchive = useCallback(
		async (plan: ActivePlanCandidate) => {
			setArchiveBusyId(plan.id);
			try {
				const result = await featurePlanMutations.setArchived(
					codebaseId,
					plan.id,
					!plan.archivedAt,
				);
				if (result.ok) {
					// The server decided the tombstone; mirror it so the switcher
					// moves the feature between active and archived sections.
					applyPlanMutation(plan.id, {
						archivedAt: result.archivedAt ?? null,
					});
				}
			} finally {
				setArchiveBusyId(null);
			}
		},
		[codebaseId, applyPlanMutation],
	);

	const confirmDelete = useCallback(async () => {
		if (!deleteTarget) return;
		setDeleteBusy(true);
		setDeleteError(null);
		try {
			const result = await featurePlanMutations.delete(
				codebaseId,
				deleteTarget.id,
			);
			if (!result.ok) {
				// The server refused (e.g. the onboarding anchor): surface why and
				// keep the dialog open rather than pretending the delete happened.
				setDeleteError(result.error ?? "Gagal menghapus fitur.");
				return;
			}
			// Drop the stored pointer before the overlay update so the workspace
			// never renders a removed plan's document from a lingering pointer.
			clearActivePlanPointer(codebaseId);
			const deletedId = deleteTarget.id;
			removePlan(deletedId);
			closeDelete();
			onDeleted?.(deletedId);
		} finally {
			setDeleteBusy(false);
		}
	}, [codebaseId, deleteTarget, closeDelete, onDeleted, removePlan]);

	return useMemo(
		() => ({
			renameTarget,
			renameDraft,
			renameError,
			renameBusy,
			setRenameDraft,
			openRename,
			closeRename,
			submitRename,
			deleteTarget,
			deleteError,
			deleteBusy,
			openDelete,
			closeDelete,
			confirmDelete,
			archiveBusyId,
			toggleArchive,
		}),
		[
			renameTarget,
			renameDraft,
			renameError,
			renameBusy,
			openRename,
			closeRename,
			submitRename,
			deleteTarget,
			deleteError,
			deleteBusy,
			openDelete,
			closeDelete,
			confirmDelete,
			archiveBusyId,
			toggleArchive,
		],
	);
}
