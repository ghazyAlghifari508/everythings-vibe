"use client";

import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import type { ActivePlanCandidate } from "@/features/codebase/services/active-plan";
import { featurePlanMutations } from "@/features/codebase/services/feature-plan-mutations-client";
import { clearActivePlanPointer } from "@/features/codebase/services/plan-storage";

/**
 * Drives the server-backed lifecycle of one repository's feature plans:
 * rename, archive/unarchive, and permanent delete, plus the destructive
 * confirmation and rename dialogs they need.
 *
 * Every mutation posts to the feature-scoped route and, on success, refetches
 * the workspace loader (`router.invalidate`) so the plan list, active
 * resolution, artifacts and history all come back from the server's
 * authoritative state — the client never keeps an optimistic copy that could
 * drift. A failed mutation surfaces the server's message and changes nothing.
 *
 * Deleting the active plan clears the stored active pointer before the
 * refetch, then reports the deletion so the parent can steer selection to a
 * surviving feature (or the create-new flow when none remain). Deleting the
 * durable onboarding anchor is refused server-side and reported here as an
 * error, never applied optimistically.
 */
export function useFeaturePlanLifecycle({
	codebaseId,
	onDeleted,
}: {
	codebaseId: string;
	/** Called after a confirmed delete so the parent can reconcile selection. */
	onDeleted?: (deletedPlanId: string) => void;
}) {
	const router = useRouter();
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
			closeRename();
			await router.invalidate();
		} finally {
			setRenameBusy(false);
		}
	}, [codebaseId, renameDraft, renameTarget, closeRename, router]);

	const toggleArchive = useCallback(
		async (plan: ActivePlanCandidate) => {
			setArchiveBusyId(plan.id);
			try {
				const result = await featurePlanMutations.setArchived(
					codebaseId,
					plan.id,
					!plan.archivedAt,
				);
				if (result.ok) await router.invalidate();
			} finally {
				setArchiveBusyId(null);
			}
		},
		[codebaseId, router],
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
			// Drop the stored pointer before the refetch so the workspace never
			// renders a removed plan's document from a lingering active pointer.
			clearActivePlanPointer(codebaseId);
			const deletedId = deleteTarget.id;
			closeDelete();
			onDeleted?.(deletedId);
			await router.invalidate();
		} finally {
			setDeleteBusy(false);
		}
	}, [codebaseId, deleteTarget, closeDelete, onDeleted, router]);

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
