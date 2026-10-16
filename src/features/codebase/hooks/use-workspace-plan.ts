import { useEffect, useMemo, useState } from "react";
import {
	resolveActivePlan,
	selectUserFacingPlans,
} from "@/lib/codebase-active-plan";
import {
	readActivePlanPointer,
	storeActivePlanPointer,
} from "@/lib/codebase-plan-storage";
import type { WorkspacePlanState } from "@/lib/codebase-workspace-hydration";
import type { CodebaseWorkspaceData } from "../services/workspace-loader.functions";

export function useWorkspacePlan({
	codebase,
	plans,
	onboardingFeatureId,
}: Pick<CodebaseWorkspaceData, "codebase" | "plans" | "onboardingFeatureId">) {
	const [requestedProjectId, setRequestedProjectId] = useState<string | null>(
		null,
	);
	const [isCreatingNew, setIsCreatingNew] = useState(false);
	const planResolution = useMemo(
		() =>
			resolveActivePlan({
				requestedProjectId:
					requestedProjectId ?? readActivePlanPointer(codebase.id),
				anchorProjectId: onboardingFeatureId,
				plans,
			}),
		[codebase.id, onboardingFeatureId, plans, requestedProjectId],
	);
	useEffect(() => {
		if (planResolution.kind === "resolved")
			storeActivePlanPointer(codebase.id, planResolution.plan.id);
	}, [codebase.id, planResolution]);
	const resolvedPlan =
		planResolution.kind === "resolved" ? planResolution.plan : null;
	const onboardingFeature = useMemo(
		() =>
			onboardingFeatureId
				? (plans.find((plan) => plan.id === onboardingFeatureId) ?? null)
				: null,
		[onboardingFeatureId, plans],
	);
	const userFacingPlans = useMemo(
		() => selectUserFacingPlans(plans, onboardingFeatureId),
		[plans, onboardingFeatureId],
	);
	const [activeFeature, setActiveFeature] = useState<{
		id: string;
		name: string;
		featuresStatus?: string | null;
	} | null>(null);
	const resolvedFeature = activeFeature ?? resolvedPlan;
	const effectiveFeatureId = resolvedFeature?.id ?? null;
	const planState: WorkspacePlanState =
		planResolution.kind === "resolved"
			? "resolved"
			: planResolution.kind === "empty"
				? "empty"
				: planResolution.kind === "unknown"
					? "failed"
					: "needs_selection";
	return {
		setRequestedProjectId,
		isCreatingNew,
		setIsCreatingNew,
		onboardingFeature,
		userFacingPlans,
		setActiveFeature,
		resolvedFeature,
		effectiveFeatureId,
		planState,
	};
}
