/**
 * What the workspace is allowed to show right now.
 *
 * The reported bug rendered the pristine composer "Apa yang ingin kamu bangun?"
 * while the real planning was still loading — and again when an artifact read
 * had actually failed. Both are false states: one claims an empty repository
 * before the server was asked, the other hides a failure behind an empty plan.
 *
 * This module makes the distinction explicit. Every artifact reports its own
 * real hydration status, and the view is derived from those statuses instead of
 * from the absence of transient React state.
 */

export type ArtifactHydrationStatus =
	/** Not answered by the server yet. */
	| "pending"
	/** The server returned real persisted content. */
	| "ready"
	/** The server answered and there is genuinely no such artifact. */
	| "empty"
	/** The request failed; the artifact's real state is unknown. */
	| "failed";

export type ArtifactKind = "feature" | "prd" | "ac" | "tasks";

export interface WorkspaceArtifactHydration {
	feature: ArtifactHydrationStatus;
	prd: ArtifactHydrationStatus;
	ac: ArtifactHydrationStatus;
	tasks: ArtifactHydrationStatus;
}

/** Whether the plan itself resolved. */
export type WorkspacePlanState =
	| "resolved"
	| "empty"
	| "needs_selection"
	| "failed";

export type WorkspaceView =
	/** A plan exists and its artifacts are still being read. */
	| { kind: "loading" }
	/** The plan could not be read, or every artifact read failed. */
	| { kind: "plan_unavailable"; reason: "load_failed" | "not_found" }
	/** Several plans exist and none of them is the obvious one. */
	| { kind: "needs_plan_selection" }
	/** No planning exists yet and nothing failed. */
	| { kind: "pristine" }
	/** Real planning is present; `failedArtifacts` names what could not load. */
	| { kind: "active"; failedArtifacts: readonly ArtifactKind[] };

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
	"feature",
	"prd",
	"ac",
	"tasks",
];

export interface ResolveWorkspaceViewInput {
	plan: WorkspacePlanState;
	artifacts: WorkspaceArtifactHydration;
	/** Local activity that must never be hidden behind a pristine state. */
	hasMessages: boolean;
	hasQuestions: boolean;
	isSending: boolean;
	runStatus: "idle" | "running" | "failed" | "done";
}

export function emptyArtifactHydration(): WorkspaceArtifactHydration {
	return {
		feature: "pending",
		prd: "pending",
		ac: "pending",
		tasks: "pending",
	};
}

/** Artifacts the user must be told about because their real state is unknown. */
export function failedArtifactKinds(
	artifacts: WorkspaceArtifactHydration,
): ArtifactKind[] {
	return ARTIFACT_KINDS.filter((kind) => artifacts[kind] === "failed");
}

export function hasAnyReadyArtifact(
	artifacts: WorkspaceArtifactHydration,
): boolean {
	return ARTIFACT_KINDS.some((kind) => artifacts[kind] === "ready");
}

function hasLocalActivity(input: ResolveWorkspaceViewInput): boolean {
	return (
		input.hasMessages ||
		input.hasQuestions ||
		input.isSending ||
		input.runStatus === "running" ||
		input.runStatus === "failed" ||
		input.runStatus === "done"
	);
}

/**
 * Derive the view.
 *
 * Ordering matters. A failed plan read outranks everything: an unknown plan is
 * not an empty plan. Loading outranks pristine, so a slow or partial read can
 * never paint the initial composer. And a plan whose artifact reads all failed
 * is reported as unavailable rather than empty, because "we could not read it"
 * and "there is nothing there" call for different user actions.
 */
export function resolveWorkspaceView(
	input: ResolveWorkspaceViewInput,
): WorkspaceView {
	if (input.plan === "failed") {
		return { kind: "plan_unavailable", reason: "load_failed" };
	}
	if (input.plan === "needs_selection") {
		return { kind: "needs_plan_selection" };
	}
	if (input.plan === "empty") return { kind: "pristine" };

	const { artifacts } = input;
	if (hasAnyReadyArtifact(artifacts)) {
		return { kind: "active", failedArtifacts: failedArtifactKinds(artifacts) };
	}

	const statuses = ARTIFACT_KINDS.map((kind) => artifacts[kind]);
	const allFailed = statuses.every((status) => status === "failed");
	if (allFailed && !hasLocalActivity(input)) {
		return { kind: "plan_unavailable", reason: "load_failed" };
	}

	const allEmpty = statuses.every((status) => status === "empty");
	if (allEmpty && !hasLocalActivity(input)) return { kind: "pristine" };

	// Anything still pending, or a mixed failed/empty result with no local
	// activity, is genuinely unresolved: keep showing the loading surface
	// instead of asserting either an empty repository or a broken one.
	if (!hasLocalActivity(input) && statuses.some((s) => s === "pending")) {
		return { kind: "loading" };
	}

	return { kind: "active", failedArtifacts: failedArtifactKinds(artifacts) };
}
