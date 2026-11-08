/**
 * Flow-step progression + generation-completeness rules.
 *
 * projects.step must reflect the FURTHEST stage a project actually reached.
 * Before this, every writer set step unconditionally, so re-generating AC after
 * Task was done rewound step 'task' -> 'ac' and History sent the user back to
 * the AC page. Step is now monotonic: it only ever moves forward.
 */
import {
	type FlowStep,
	type StepRouteTarget,
	stepRank,
	stepToRouteTarget,
} from "@/features/greenfield/utils/flow-step";
import { workspaceView } from "@/features/greenfield/utils/workspace-routing";

/**
 * True when the project has progressed past the PRD stage (e.g. AC or Task).
 * At this point, PRD content is finalized and locked to prevent downstream
 * desynchronization of AC and tasks.
 */
export function isPrdLocked(step: string | null | undefined): boolean {
	return stepRank(step) > stepRank("prd");
}

/**
 * Furthest of current (DB) and next (what a writer wants to set).
 * Returns null when no write is needed - caller skips the step UPDATE.
 */
export function advanceStep(
	current: string | null | undefined,
	next: FlowStep,
): FlowStep | null {
	return stepRank(next) > stepRank(current) ? next : null;
}

/**
 * Whether the Ask success marker may set step to "question".
 * Only for projects with no PRD version that have not advanced past
 * prd, so a repeated Ask call can never rewind an ac/task project.
 */
export function shouldMarkQuestionStep(
	current: string | null | undefined,
	hasPrd: boolean,
): boolean {
	return !hasPrd && stepRank(current) <= stepRank("prd");
}

/**
 * True when a streamed generation must NOT be persisted as a new version.
 *
 * A dropped/aborted stream used to be saved anyway, creating a partial version
 * that outranked the complete one (AC v2 = 1440 chars vs v1 = 19818) and became
 * what the viewer showed.
 */
const TRUNCATING_REASONS = new Set(["length", "error", "content-filter"]);

export function isTruncatedGeneration(
	content: string,
	finishReason: string | undefined,
): boolean {
	if (!content || !content.trim()) return true;
	// ponytail: deny-list, not allow-list. undefined/"unknown"/"other" means the provider
	// reported a non-standard finish or completed via custom stop sequence.
	// Only explicit hard failure reasons ("length", "error", "content-filter") discard it.
	return finishReason !== undefined && TRUNCATING_REASONS.has(finishReason);
}

const PROJECT_ID_RE =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function isValidHistoryUrl(url: string, projectId: string): boolean {
	if (url === "/codebases") return true;
	if (!PROJECT_ID_RE.test(projectId)) return false;
	if (url === `/vibeplan/${projectId}`) return true;
	const view = workspaceView(url);
	return (
		view !== null &&
		(url === `/vibeplan/${projectId}/${view}` ||
			url === `/${view}/${projectId}`)
	);
}

export function resolveHistoryUrl(item: {
	id: string;
	step: string | null | undefined;
	lastUrl: string | null | undefined;
}): string {
	if (item.lastUrl === "/codebases") return "/codebases";
	if (item.lastUrl && isValidHistoryUrl(item.lastUrl, item.id)) {
		const view = workspaceView(item.lastUrl);
		if (view) return `/vibeplan/${encodeURIComponent(item.id)}/${view}`;
	}
	// Availability must be checked on the server, not inferred from the DB step.
	return `/vibeplan/${encodeURIComponent(item.id)}`;
}

export type HistoryRouteTarget =
	| StepRouteTarget
	| { to: "/vibeplan/$id"; params: { id: string } }
	| { to: "/codebases" };

export function parseHistoryHref(href: string): HistoryRouteTarget | null {
	if (href === "/codebases") return { to: "/codebases" };
	const match =
		/^\/vibeplan\/([^/]+)(?:\/(?:ask|fitur|prd|ac|task|kanban))?$/.exec(href) ??
		/^\/(?:ask|fitur|prd|ac|task|kanban)\/([^/]+)$/.exec(href);
	const id = match?.[1];
	if (!id || !isValidHistoryUrl(href, id)) return null;
	const view = workspaceView(href);
	return view
		? stepToRouteTarget(view, id)
		: { to: "/vibeplan/$id", params: { id } };
}
