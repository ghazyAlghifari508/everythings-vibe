import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type ActivePlanCandidate,
	resolveActivePlan,
	selectUserFacingPlans,
} from "@/features/codebase/services/active-plan";
import {
	readActivePlanPointer,
	storeActivePlanPointer,
} from "@/features/codebase/services/plan-storage";
import type { WorkspacePlanState } from "@/features/codebase/services/workspace-hydration";
import type { CodebaseWorkspaceData } from "../services/workspace-loader.functions";

const NO_CREATED_PLANS: CodebaseWorkspaceData["plans"] = [];

export function useWorkspacePlan({
	codebase,
	plans: persistedPlans,
	onboardingFeatureId,
}: Pick<CodebaseWorkspaceData, "codebase" | "plans" | "onboardingFeatureId">) {
	const [createdPlansState, setCreatedPlansState] = useState<{
		codebaseId: string;
		plans: typeof persistedPlans;
	}>({ codebaseId: codebase.id, plans: [] });
	// A plan created in this session belongs to the repository that created it;
	// after a repository switch it must not appear in the new plan list.
	const createdPlans =
		createdPlansState.codebaseId === codebase.id
			? createdPlansState.plans
			: NO_CREATED_PLANS;
	// Server-authoritative mutation overlay: rename/archive results and deleted
	// ids applied from lifecycle mutations without a full page refetch. Scoped
	// to the repository the mutation ran in, mirroring `createdPlansState`.
	const [planMutations, setPlanMutations] = useState<{
		codebaseId: string;
		byId: Record<string, Partial<ActivePlanCandidate>>;
		removedIds: string[];
	}>({ codebaseId: codebase.id, byId: {}, removedIds: [] });
	const localMutations =
		planMutations.codebaseId === codebase.id ? planMutations : null;
	const plans = useMemo(() => {
		const base = [
			...persistedPlans,
			...createdPlans.filter(
				(created) => !persistedPlans.some((plan) => plan.id === created.id),
			),
		];
		if (!localMutations) return base;
		const removed = new Set(localMutations.removedIds);
		const byId = localMutations.byId;
		return base
			.filter((plan) => !removed.has(plan.id))
			.map((plan) => (byId[plan.id] ? { ...plan, ...byId[plan.id] } : plan));
	}, [persistedPlans, createdPlans, localMutations]);
	/**
	 * Apply one authoritative mutation result to the plan list. The caller only
	 * calls this with fields the server returned, so the local list never
	 * invents state — it mirrors what the backend accepted.
	 */
	const applyPlanMutation = useCallback(
		(projectId: string, patch: Partial<ActivePlanCandidate>) => {
			setPlanMutations((current) => {
				const scoped =
					current.codebaseId === codebase.id
						? current
						: { codebaseId: codebase.id, byId: {}, removedIds: [] };
				return {
					codebaseId: codebase.id,
					byId: {
						...scoped.byId,
						[projectId]: { ...scoped.byId[projectId], ...patch },
					},
					removedIds: scoped.removedIds,
				};
			});
		},
		[codebase.id],
	);
	const removePlan = useCallback(
		(projectId: string) => {
			setPlanMutations((current) => {
				const scoped =
					current.codebaseId === codebase.id
						? current
						: { codebaseId: codebase.id, byId: {}, removedIds: [] };
				return {
					codebaseId: codebase.id,
					byId: scoped.byId,
					removedIds: scoped.removedIds.includes(projectId)
						? scoped.removedIds
						: [...scoped.removedIds, projectId],
				};
			});
		},
		[codebase.id],
	);
	// The selection is scoped to the repository it was made in. A workspace
	// that navigates to another repository must resolve that repository's plan
	// from its own data, never from a leftover id of the previous one.
	const [selection, setSelection] = useState<{
		codebaseId: string;
		projectId: string;
	} | null>(null);
	const requestedProjectId =
		selection?.codebaseId === codebase.id ? selection.projectId : null;
	const setRequestedProjectId = useCallback(
		(projectId: string) => setSelection({ codebaseId: codebase.id, projectId }),
		[codebase.id],
	);
	const [isCreatingNew, setIsCreatingNew] = useState(false);
	const planResolution = useMemo(
		() =>
			resolveActivePlan({
				requestedProjectId,
				anchorProjectId: onboardingFeatureId,
				plans,
			}),
		[requestedProjectId, onboardingFeatureId, plans],
	);
	// Hydration: the server resolves the plan from loader data alone, so the
	// first client render must not consult browser storage either — reading the
	// pointer during render is exactly what made server and client markup name
	// different plans. The stored navigation preference is applied here, after
	// hydration, and only while it still names a plan this repository actually
	// owns: a stale or foreign pointer is dropped rather than forced active, and
	// the effect below rewrites storage with the plan that won instead.
	useEffect(() => {
		const pointer = readActivePlanPointer(codebase.id);
		if (!pointer) return;
		if (!plans.some((plan) => plan.id === pointer)) return;
		setSelection((current) =>
			current && current.codebaseId === codebase.id
				? current
				: { codebaseId: codebase.id, projectId: pointer },
		);
	}, [codebase.id, plans]);
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
	const [activeFeatureState, setActiveFeatureState] = useState<{
		codebaseId: string;
		feature: {
			id: string;
			name: string;
			featuresStatus?: string | null;
		};
	} | null>(null);
	const setActiveFeature = useCallback(
		(
			feature: {
				id: string;
				name: string;
				featuresStatus?: string | null;
			} | null,
		) =>
			setActiveFeatureState(
				feature ? { codebaseId: codebase.id, feature } : null,
			),
		[codebase.id],
	);
	// A created-feature override belongs to the repository it was created in;
	// after a repository switch it must not keep naming the previous plan.
	const activeFeature =
		activeFeatureState?.codebaseId === codebase.id
			? activeFeatureState.feature
			: null;
	const isAnchorWithoutArtifacts =
		resolvedPlan?.id === onboardingFeatureId && !resolvedPlan?.hasArtifacts;
	const resolvedFeature =
		isCreatingNew || isAnchorWithoutArtifacts
			? null
			: (activeFeature ?? resolvedPlan);
	const effectiveFeatureId = resolvedFeature?.id ?? null;
	const planState: WorkspacePlanState =
		isCreatingNew || isAnchorWithoutArtifacts
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
		// The full merged plan list (persisted + session-created, active +
		// archived) so the switcher panel can split it into the active switcher
		// and the recoverable archived section.
		plans,
		userFacingPlans,
		// Authoritative mutation overlay: the switcher panel applies the
		// server's rename/archive result here and removes deleted features, so
		// the plan list, active resolution and switcher sections all reflect the
		// mutation without a full page refetch.
		applyPlanMutation,
		removePlan,
		setActiveFeature,
		registerCreatedPlan: (plan: { id: string; name: string }) => {
			setCreatedPlansState((current) => {
				const base = current.codebaseId === codebase.id ? current.plans : [];
				return {
					codebaseId: codebase.id,
					plans: base.some((entry) => entry.id === plan.id)
						? base
						: [...base, { ...plan, updatedAt: null, hasArtifacts: false }],
				};
			});
			setRequestedProjectId(plan.id);
			storeActivePlanPointer(codebase.id, plan.id);
		},
		resolvedFeature,
		effectiveFeatureId,
		planState,
	};
}
