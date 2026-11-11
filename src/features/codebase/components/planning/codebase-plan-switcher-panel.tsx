"use client";

import { useMemo } from "react";
import { useFeaturePlanLifecycle } from "@/features/codebase/hooks/use-feature-plan-lifecycle";
import {
	type ActivePlanCandidate,
	selectArchivedPlans,
	selectUserFacingPlans,
} from "@/features/codebase/services/active-plan";
import { CodebasePlanDeleteDialog } from "./codebase-plan-delete-dialog";
import { CodebasePlanRenameDialog } from "./codebase-plan-rename-dialog";
import { CodebasePlanSwitcher } from "./codebase-plan-switcher";

/**
 * Owns the plan switcher plus its management surface: rename/archive/delete
 * actions, the destructive-confirmation and rename dialogs, and post-mutation
 * state reconciliation.
 *
 * The switcher shows the repository's active feature plans; archived ones stay
 * reachable in a collapsed section. Each mutation refetches the workspace
 * loader on success (server-authoritative), so this panel never edits the plan
 * list locally. When the deleted plan was the active one, selection is steered
 * to a surviving feature so the workspace never renders a removed plan's
 * stale document, and never navigates to a nonexistent feature.
 */
export function CodebasePlanSwitcherPanel({
	codebaseId,
	plans,
	anchorProjectId,
	activePlanId,
	activePlanName,
	onSelectPlan,
	onCreateFeature,
}: {
	codebaseId: string;
	/** Every non-deleted feature plan (active + archived). */
	plans: readonly ActivePlanCandidate[];
	anchorProjectId: string | null;
	activePlanId: string | null;
	activePlanName: string | null;
	onSelectPlan: (projectId: string) => void;
	onCreateFeature: () => void;
}) {
	const lifecycle = useFeaturePlanLifecycle({
		codebaseId,
		onDeleted: (deletedId) => {
			if (deletedId !== activePlanId) return;
			// The active plan is gone. Steer to a surviving active feature, or the
			// create-new flow when the repository has none left.
			const survivor = selectUserFacingPlans(plans, anchorProjectId).find(
				(plan) => plan.id !== deletedId,
			);
			if (survivor) onSelectPlan(survivor.id);
			else onCreateFeature();
		},
	});

	const activePlans = useMemo(
		() => selectUserFacingPlans(plans, anchorProjectId),
		[plans, anchorProjectId],
	);
	const archivedPlans = useMemo(
		() => selectArchivedPlans(plans, anchorProjectId),
		[plans, anchorProjectId],
	);

	return (
		<>
			<CodebasePlanSwitcher
				plans={activePlans}
				archivedPlans={archivedPlans}
				activePlanId={activePlanId}
				activePlanName={activePlanName}
				onSelectPlan={onSelectPlan}
				onCreateFeature={onCreateFeature}
				onRename={lifecycle.openRename}
				onArchive={(plan) => void lifecycle.toggleArchive(plan)}
				onDelete={lifecycle.openDelete}
			/>
			<CodebasePlanRenameDialog
				planName={lifecycle.renameTarget?.name ?? null}
				draft={lifecycle.renameDraft}
				error={lifecycle.renameError}
				busy={lifecycle.renameBusy}
				onDraftChange={lifecycle.setRenameDraft}
				onCancel={lifecycle.closeRename}
				onConfirm={() => void lifecycle.submitRename()}
			/>
			<CodebasePlanDeleteDialog
				planName={lifecycle.deleteTarget?.name ?? null}
				deleting={lifecycle.deleteBusy}
				onCancel={lifecycle.closeDelete}
				onConfirm={() => void lifecycle.confirmDelete()}
			/>
		</>
	);
}
