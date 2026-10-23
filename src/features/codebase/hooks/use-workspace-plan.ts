import { useEffect, useMemo, useState } from "react";
import {
	resolveActivePlan,
	selectUserFacingPlans,
} from "@/features/codebase/services/active-plan";
import {
	readActivePlanPointer,
	storeActivePlanPointer,
} from "@/features/codebase/services/plan-storage";
import type { WorkspacePlanState } from "@/features/codebase/services/workspace-hydration";
import type { CodebaseWorkspaceData } from "../services/workspace-loader.functions";

export function useWorkspacePlan({
	codebase,
	plans: persistedPlans,
	onboardingFeatureId,
}: Pick<CodebaseWorkspaceData, "codebase" | "plans" | "onboardingFeatureId">) {
	const [createdPlans, setCreatedPlans] = useState<typeof persistedPlans>([]);
	const plans = useMemo(
		() => [
			...persistedPlans,
			...createdPlans.filter(
				(created) => !persistedPlans.some((plan) => plan.id === created.id),
			),
		],
		[persistedPlans, createdPlans],
	);
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
		if (!isCreatingNew && planResolution.kind === "resolved")
			storeActivePlanPointer(codebase.id, planResolution.plan.id);
	}, [codebase.id, planResolution, isCreatingNew]);
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
	const resolvedFeature = isCreatingNew
		? null
		: (activeFeature ?? resolvedPlan);
	const effectiveFeatureId = resolvedFeature?.id ?? null;
	const planState: WorkspacePlanState = isCreatingNew
		? "empty"
		: resolvedFeature
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
		registerCreatedPlan: (plan: { id: string; name: string }) => {
			setCreatedPlans((current) =>
				current.some((entry) => entry.id === plan.id)
					? current
					: [...current, { ...plan, updatedAt: null, hasArtifacts: false }],
			);
			setRequestedProjectId(plan.id);
			storeActivePlanPointer(codebase.id, plan.id);
		},
		resolvedFeature,
		effectiveFeatureId,
		planState,
	};
}
