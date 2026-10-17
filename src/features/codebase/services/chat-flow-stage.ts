import type { CodebasePipelineStage } from "./chat-flow-run";

export interface AutoRevealInput {
	/**
	 * The artifact was reloaded from the authoritative server state, so it is
	 * known to be persisted. A request that merely returned 200 is not enough.
	 */
	persisted: boolean;
	/**
	 * The user has already chosen what the right panel shows (opened another
	 * artifact, or closed it). An automatic reveal must not fight that choice.
	 */
	userTookOverCanvas: boolean;
}

/**
 * Whether a finished stage may reveal its artifact in the right panel.
 *
 * Both conditions are required: the artifact must be confirmed persisted
 * server-side, and the user must not have taken over the panel. This keeps the
 * reveal honest (never based on an assumed success) and unobtrusive (never
 * stealing focus from a deliberate interaction).
 */
export function shouldAutoRevealArtifact(input: AutoRevealInput): boolean {
	return input.persisted && !input.userTookOverCanvas;
}

export interface ResumeStageInput {
	/** A feature tree is persisted for this project. */
	hasFeatureTree: boolean;
	/** A PRD version is persisted for this project. */
	hasPrd: boolean;
	/** An Acceptance Criteria version is persisted for this project. */
	hasAc: boolean;
	/**
	 * Task rows exist in the database, or a task tree is readable. Either one
	 * means the project reached the handoff stage.
	 */
	hasTasks: boolean;
}

/**
 * The stage a set of per-artifact hydration statuses proves.
 *
 * Derived from `ArtifactHydrationStatus` rather than from raw content values,
 * so a read that genuinely returned nothing (`empty`), a read still in flight
 * (`pending`), and a read that failed (`failed`) never collapse into the same
 * "no artifact" answer. Only `ready` advances the stage: a `pending` or
 * `failed` artifact is unproven, never absent.
 *
 * `null` is accepted for callers that only know presence, and is read as
 * "not ready" — the same conservative direction.
 */
export type ArtifactReadState =
	| "pending"
	| "ready"
	| "empty"
	| "failed"
	| null
	| undefined;

export interface PersistedStageInput {
	feature: ArtifactReadState;
	prd: ArtifactReadState;
	ac: ArtifactReadState;
	tasks: ArtifactReadState;
}

/**
 * Priority resolution over persisted artifacts:
 *   TASK READY    -> handoff
 *   AC READY      -> ac
 *   PRD READY     -> prd
 *   FEATURE READY -> feature
 *   otherwise     -> questions
 *
 * This is a stage *priority*, not an instruction to show a stage early: it only
 * ever returns a stage some artifact has already been proven to hold.
 */
export function resolvePersistedStage(
	input: PersistedStageInput,
): CodebasePipelineStage {
	if (isReady(input.tasks)) return "handoff";
	if (isReady(input.ac)) return "ac";
	if (isReady(input.prd)) return "prd";
	if (isReady(input.feature)) return "feature";
	return "questions";
}

function isReady(state: ArtifactReadState): boolean {
	return state === "ready";
}

/**
 * The stage a reopened workspace must resume at, derived from the artifacts
 * that are actually persisted.
 *
 * Ordered by pipeline progress, so a project that already reached Task reopens
 * at handoff rather than rewinding to an earlier artifact that still exists.
 * This is what makes refresh and History re-entry resume instead of restarting.
 */
export function resolveResumeStage(
	input: ResumeStageInput,
): CodebasePipelineStage {
	return resolvePersistedStage({
		feature: presenceToReadState(input.hasFeatureTree),
		prd: presenceToReadState(input.hasPrd),
		ac: presenceToReadState(input.hasAc),
		tasks: presenceToReadState(input.hasTasks),
	});
}

/** Read a boolean presence flag as the read state it proves. */
function presenceToReadState(present: boolean): ArtifactReadState {
	return present ? "ready" : "empty";
}

/**
 * Pipeline order of every stage, with the terminal `handoff` last. Used to
 * compare two stages without depending on the order the artifacts happened to
 * arrive in.
 */
export const CODEBASE_STAGE_RANK: Record<CodebasePipelineStage, number> = {
	questions: 0,
	feature: 1,
	prd: 2,
	ac: 3,
	task: 4,
	handoff: 4,
};

/**
 * Reconcile the visible stage with the stage the persisted artifacts prove.
 *
 * The visible stage only ever moves forward. This is what makes the pipeline
 * independent of the order asynchronous reads settle: a feature tree that
 * finishes first may advance the stage to `feature`, and a task list that
 * finishes last still lifts it to `handoff`, because the reconciliation always
 * takes the furthest of the two. A late or failed read can never pull the
 * workspace back to a stage the user has already left.
 *
 * Moving backwards is reserved for a deliberate reset, which the caller does by
 * passing `"questions"` as the visible stage explicitly.
 */
export function reconcilePipelineStage(
	visible: CodebasePipelineStage,
	persisted: CodebasePipelineStage,
): CodebasePipelineStage {
	return CODEBASE_STAGE_RANK[persisted] > CODEBASE_STAGE_RANK[visible]
		? persisted
		: visible;
}
