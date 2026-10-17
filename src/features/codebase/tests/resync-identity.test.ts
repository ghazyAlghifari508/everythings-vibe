import { describe, expect, it } from "vitest";
import {
	type ActivePlanCandidate,
	resolveActivePlan,
} from "@/features/codebase/services/active-plan";
import {
	compareRepositoryIdentity,
	normalizeRepositoryIdentity,
} from "@/features/codebase/services/repository-identity";

/**
 * Repository-identity and multi-plan contracts.
 *
 * These cover the two ways a repository can be mistaken for another: several
 * feature plans inside one repository, and two repositories that share a folder
 * name. Neither may be resolved by position or by name similarity.
 */

function plan(
	id: string,
	hasArtifacts: boolean,
	updatedAt = "2026-01-01T00:00:00.000Z",
): ActivePlanCandidate {
	return { id, name: id, updatedAt, hasArtifacts };
}

describe("re-sync keeps the repository and its plans intact", () => {
	it("keeps resolving the plan that holds artifacts after a newer plan is created", () => {
		// A re-sync does not create a plan, but the workspace can: the plan list
		// grows while the original planning stays attached to its own project.
		const before = resolveActivePlan({
			plans: [plan("watchlist", true)],
		});
		const after = resolveActivePlan({
			plans: [
				plan("review-film", false, "2026-09-01T00:00:00.000Z"),
				plan("watchlist", true),
			],
		});
		expect(before.kind).toBe("resolved");
		expect(after.kind).toBe("resolved");
		if (before.kind !== "resolved" || after.kind !== "resolved") return;
		// The original plan still wins: the new one carries no planning.
		expect(after.plan.id).toBe("watchlist");
		expect(before.plan.id).toBe(after.plan.id);
	});

	it("keeps each plan's identity separate when both carry planning", () => {
		const resolution = resolveActivePlan({
			plans: [plan("watchlist", true), plan("review-film", true)],
		});
		// Two real plans are never merged into one Kanban or one document set.
		expect(resolution.kind).toBe("needs_selection");
	});

	it("still resolves the anchor when a re-sync added no plan at all", () => {
		const resolution = resolveActivePlan({
			anchorProjectId: "onboarding",
			plans: [plan("onboarding", false), plan("draft", false)],
		});
		expect(resolution.kind).toBe("resolved");
		if (resolution.kind !== "resolved") return;
		expect(resolution.plan.id).toBe("onboarding");
		expect(resolution.source).toBe("anchor");
	});
});

describe("two repositories that share a folder name stay separate", () => {
	it("produces different identities for the same name on different hosts", () => {
		const mine = normalizeRepositoryIdentity(
			"https://github.com/me/react-movie-app.git",
		);
		const theirs = normalizeRepositoryIdentity(
			"https://gitlab.com/them/react-movie-app.git",
		);
		expect(mine).not.toBe(theirs);
		expect(compareRepositoryIdentity(mine, theirs).matches).toBe(false);
	});

	it("produces different identities for two owners on one host", () => {
		const mine = normalizeRepositoryIdentity(
			"git@github.com:me/react-movie-app.git",
		);
		const fork = normalizeRepositoryIdentity(
			"git@github.com:them/react-movie-app.git",
		);
		expect(compareRepositoryIdentity(mine, fork).matches).toBe(false);
	});

	it("recognises the same repository from a different clone path", () => {
		// The remote is the identity, so the local folder name is irrelevant.
		const first = normalizeRepositoryIdentity(
			"https://github.com/me/react-movie-app.git",
		);
		const second = normalizeRepositoryIdentity(
			"git@github.com:me/react-movie-app",
		);
		expect(compareRepositoryIdentity(first, second).matches).toBe(true);
	});

	it("never merges a repository that has no verifiable identity", () => {
		// A repository with no remote reports no identity, so it can never be
		// matched to another repository by name.
		expect(normalizeRepositoryIdentity(null)).toBeNull();
		expect(compareRepositoryIdentity(null, null).matches).toBe(false);
	});
});
