import { describe, expect, it } from "vitest";
import {
	determineOnboardingProjectAssignment,
	resolveOnboardingAnchorProject,
} from "@/lib/codebase-anchor";

describe("feature route onboarding anchor assignment policy", () => {
	it("assigns the first created feature project as the onboarding project anchor", () => {
		const result = determineOnboardingProjectAssignment({
			currentAnchorId: null,
			newProjectId: "feature-proj-1",
		});
		expect(result.shouldAssign).toBe(true);
		expect(result.onboardingProjectId).toBe("feature-proj-1");
	});

	it("preserves existing anchor and skips update for later feature projects (immutable)", () => {
		const result = determineOnboardingProjectAssignment({
			currentAnchorId: "feature-proj-1",
			newProjectId: "feature-proj-2",
		});
		expect(result.shouldAssign).toBe(false);
		expect(result.onboardingProjectId).toBe("feature-proj-1");
	});

	it("handles concurrent creation race deterministically: first committer wins, second is no-op", () => {
		// State before any feature is created
		let persistedAnchorId: string | null = null;

		const handleCreateFeature = (newProjectId: string) => {
			const decision = determineOnboardingProjectAssignment({
				currentAnchorId: persistedAnchorId,
				newProjectId,
			});
			if (decision.shouldAssign) {
				persistedAnchorId = decision.onboardingProjectId;
			}
			return decision;
		};

		// Two concurrent or sequential feature creations
		const tx1 = handleCreateFeature("proj-first-win");
		const tx2 = handleCreateFeature("proj-second-race");

		expect(tx1.shouldAssign).toBe(true);
		expect(tx1.onboardingProjectId).toBe("proj-first-win");

		// Second transaction sees the locked anchor and does not overwrite
		expect(tx2.shouldAssign).toBe(false);
		expect(tx2.onboardingProjectId).toBe("proj-first-win");
		expect(persistedAnchorId).toBe("proj-first-win");
	});

	it("preserves user scoping when resolving anchor project", () => {
		const userAProjects = [
			{ id: "proj-user-a-anchor", codebaseId: "cb-1", userId: "user-a" },
		];
		const userBProjects = [
			{ id: "proj-user-b-feature", codebaseId: "cb-1", userId: "user-b" },
		];

		// User A has an anchor
		const anchorA = resolveOnboardingAnchorProject({
			onboardingProjectId: "proj-user-a-anchor",
			projects: userAProjects,
			expectedCodebaseId: "cb-1",
		});
		expect(anchorA?.id).toBe("proj-user-a-anchor");

		// User B looking at User A's anchor returns null (unauthorized / missing in User B's scope)
		const anchorB = resolveOnboardingAnchorProject({
			onboardingProjectId: "proj-user-a-anchor",
			projects: userBProjects,
			expectedCodebaseId: "cb-1",
		});
		expect(anchorB).toBeNull();
	});
});
