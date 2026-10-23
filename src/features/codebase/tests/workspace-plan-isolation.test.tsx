// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useWorkspacePlan } from "../hooks/use-workspace-plan";

const plans = [
	{ id: "a", name: "Feature A", updatedAt: null, hasArtifacts: true },
	{ id: "anchor", name: "Repository", updatedAt: null, hasArtifacts: false },
];
const data = {
	codebase: {
		id: "repo",
		name: "Repository",
		onboardingProjectId: "anchor",
		repositoryIdentity: null,
	},
	plans,
	onboardingFeatureId: "anchor",
};
afterEach(() => sessionStorage.clear());

it("detaches the active plan during creation without discarding repository plans", () => {
	const { result, rerender } = renderHook(() => useWorkspacePlan(data));
	expect(result.current.effectiveFeatureId).toBe("a");
	act(() => result.current.setIsCreatingNew(true));
	expect(result.current.effectiveFeatureId).toBeNull();
	expect(result.current.resolvedFeature).toBeNull();
	expect(result.current.planState).toBe("empty");
	expect(result.current.userFacingPlans.map((plan) => plan.id)).toEqual(["a"]);
	expect(result.current.onboardingFeature?.id).toBe("anchor");
	rerender();
	expect(result.current.effectiveFeatureId).toBeNull();
	act(() => result.current.setIsCreatingNew(false));
	expect(result.current.effectiveFeatureId).toBe("a");
});
