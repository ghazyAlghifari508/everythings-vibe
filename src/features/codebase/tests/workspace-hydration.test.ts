import { describe, expect, it } from "vitest";
import {
	type ArtifactHydrationStatus,
	emptyArtifactHydration,
	failedArtifactKinds,
	resolveWorkspaceView,
	type WorkspaceArtifactHydration,
	type WorkspacePlanState,
} from "@/features/codebase/services/workspace-hydration";

function artifacts(
	status: ArtifactHydrationStatus,
): WorkspaceArtifactHydration {
	return { feature: status, prd: status, ac: status, tasks: status };
}

function view(
	plan: WorkspacePlanState,
	hydration: WorkspaceArtifactHydration,
	local: Partial<{
		hasMessages: boolean;
		hasQuestions: boolean;
		isSending: boolean;
		runStatus: "idle" | "running" | "failed" | "done";
	}> = {},
) {
	return resolveWorkspaceView({
		plan,
		artifacts: hydration,
		hasMessages: local.hasMessages ?? false,
		hasQuestions: local.hasQuestions ?? false,
		isSending: local.isSending ?? false,
		runStatus: local.runStatus ?? "idle",
	});
}

describe("resolveWorkspaceView", () => {
	it("starts every artifact as pending", () => {
		expect(emptyArtifactHydration()).toEqual({
			feature: "pending",
			prd: "pending",
			ac: "pending",
			tasks: "pending",
		});
	});

	it("shows loading while artifact reads are still outstanding", () => {
		// The reported false empty state: a slow read must never paint the
		// initial composer.
		expect(view("resolved", emptyArtifactHydration())).toEqual({
			kind: "loading",
		});
	});

	it("stays loading when only some reads have settled", () => {
		expect(
			view("resolved", {
				feature: "ready",
				prd: "pending",
				ac: "pending",
				tasks: "pending",
			}),
		).toEqual({ kind: "active", failedArtifacts: [] });
	});

	it("shows pristine only when the server confirmed there is no planning", () => {
		expect(view("resolved", artifacts("empty"))).toEqual({ kind: "pristine" });
	});

	it("never shows pristine for an empty plan while reads are pending", () => {
		expect(
			view("resolved", {
				feature: "empty",
				prd: "empty",
				ac: "empty",
				tasks: "pending",
			}),
		).toEqual({ kind: "loading" });
	});

	it("reports an unavailable plan when every artifact read failed", () => {
		// A failed API call is not an empty workspace.
		expect(view("resolved", artifacts("failed"))).toEqual({
			kind: "plan_unavailable",
			reason: "load_failed",
		});
	});

	it("reports an unavailable plan when the plan itself could not be read", () => {
		expect(view("failed", artifacts("pending"))).toEqual({
			kind: "plan_unavailable",
			reason: "load_failed",
		});
	});

	it("asks for a plan selection instead of guessing", () => {
		expect(view("needs_selection", emptyArtifactHydration())).toEqual({
			kind: "needs_plan_selection",
		});
	});

	it("shows pristine for a repository with no plans at all", () => {
		expect(view("empty", emptyArtifactHydration())).toEqual({
			kind: "pristine",
		});
	});

	it("names the artifacts that failed when others loaded", () => {
		expect(
			view("resolved", {
				feature: "ready",
				prd: "ready",
				ac: "failed",
				tasks: "empty",
			}),
		).toEqual({ kind: "active", failedArtifacts: ["ac"] });
	});

	it("keeps real local activity visible even when every read failed", () => {
		// A user mid-conversation must not have their work replaced by an error
		// panel; the failure is still reported through failedArtifacts.
		expect(
			view("resolved", artifacts("failed"), { hasMessages: true }),
		).toEqual({
			kind: "active",
			failedArtifacts: ["feature", "prd", "ac", "tasks"],
		});
	});

	it("keeps a running generation visible over an empty repository", () => {
		expect(
			view("resolved", artifacts("empty"), { runStatus: "running" }),
		).toEqual({ kind: "active", failedArtifacts: [] });
	});

	it("does not hide a failed run behind the pristine composer", () => {
		expect(
			view("resolved", artifacts("empty"), { runStatus: "failed" }),
		).toEqual({ kind: "active", failedArtifacts: [] });
	});

	it("lists only the failed artifact kinds", () => {
		expect(
			failedArtifactKinds({
				feature: "ready",
				prd: "failed",
				ac: "empty",
				tasks: "failed",
			}),
		).toEqual(["prd", "tasks"]);
	});

	it("treats a mixed failed and empty result as unresolved, not empty", () => {
		// Nothing loaded and nothing is pending, but a failure happened: the
		// real state is unknown, so neither pristine nor unavailable is honest.
		expect(
			view("resolved", {
				feature: "failed",
				prd: "empty",
				ac: "empty",
				tasks: "empty",
			}),
		).toEqual({
			kind: "active",
			failedArtifacts: ["feature"],
		});
	});
});
