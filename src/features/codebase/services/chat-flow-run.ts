export interface FlowQuestion {
	id: string;
}

/** Pipeline stage a workspace run belongs to. Mirrors the workspace stages. */
export type CodebaseRunStage = "questions" | "feature" | "prd" | "ac" | "task";

/**
 * Where the workspace is in the pipeline. Differs from `CodebaseRunStage` at
 * the end: `handoff` means the task plan is stored and the project is ready for
 * an AI coding agent, while the `task` run stage means task generation itself
 * is in flight.
 */
export type CodebasePipelineStage = CodebaseRunStage | "handoff";

/**
 * What the workspace knows about one in-flight or finished AI request.
 *
 * Every field is a client-observable fact: when the request was accepted,
 * when it settled, whether it succeeded, and the server's own failure message.
 * There is deliberately no phase, activity log or reasoning field: the
 * generators stream nothing but durable-operation status, so any "stage" the UI
 * could invent here would be fabricated progress.
 */
export interface CodebaseRunState {
	stage: CodebaseRunStage;
	/**
	 * Identity of this exact request. Late events from an earlier request carry a
	 * stale id and can never overwrite a newer run's status or duration.
	 */
	requestId: string;
	/** Wall-clock acceptance of the request, from the server when it reported one. */
	startedAt: number;
	/** Wall-clock settle time, null while the request is still in flight. */
	finishedAt: number | null;
	status: "running" | "done" | "failed";
	/** Server-reported failure message, null unless the run failed. */
	error: string | null;
}

/** Short settled label per stage, shown once the request really succeeded. */
export const CODEBASE_STAGE_DONE_LABEL: Record<CodebaseRunStage, string> = {
	questions: "Pertanyaan siap",
	feature: "Spesifikasi fitur siap",
	prd: "PRD siap",
	ac: "Acceptance criteria siap",
	task: "Task siap",
};

let runSequence = 0;

/**
 * A unique id per started request. Kept local instead of a UUID so the value is
 * deterministic, cheap, and scoped to this client session.
 */
function nextRequestId(startedAt: number): string {
	runSequence += 1;
	return `run-${startedAt}-${runSequence}`;
}

/**
 * Only owner requests may mutate a run. An omitted `requestId` keeps the legacy
 * unguarded behaviour used by callers that hold no request identity.
 */
function ownedBy(
	run: CodebaseRunState | null,
	requestId?: string,
): run is CodebaseRunState {
	return (
		run !== null && (requestId === undefined || run.requestId === requestId)
	);
}

export function startRun(
	stage: CodebaseRunStage,
	startedAt: number,
): CodebaseRunState {
	return {
		stage,
		requestId: nextRequestId(startedAt),
		startedAt,
		finishedAt: null,
		status: "running",
		error: null,
	};
}

/**
 * Re-anchor a running request on the moment the server actually accepted it, so
 * the elapsed timer measures the operation instead of the client's submit
 * latency. Ignored for a settled run, a foreign request, or an unparseable
 * timestamp — a missing server time never moves the clock.
 */
export function anchorRunStart(
	run: CodebaseRunState | null,
	acceptedAt: string | null | undefined,
	requestId?: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running" || !ownedBy(run, requestId)) return run;
	if (!acceptedAt) return run;
	const epoch = parseEpoch(acceptedAt, Number.NaN);
	if (!Number.isFinite(epoch)) return run;
	if (epoch === run.startedAt) return run;
	return { ...run, startedAt: epoch };
}

/**
 * Settle a run. A run that already settled is returned unchanged so a late
 * callback cannot rewrite the recorded outcome or the recorded duration.
 */
export function settleRun(
	run: CodebaseRunState | null,
	status: "done" | "failed",
	finishedAt: number,
	error?: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running") return run;
	return {
		...run,
		status,
		finishedAt,
		error: status === "failed" ? (error ?? run.error) : null,
	};
}

/**
 * Settle only the request that owns this callback. A late settle from an earlier
 * request is dropped instead of rewriting a newer run's status and duration.
 */
export function settleRunIfCurrent(
	run: CodebaseRunState | null,
	requestId: string,
	status: "done" | "failed",
	finishedAt: number,
	error?: string,
): CodebaseRunState | null {
	if (!run || run.requestId !== requestId) return run;
	return settleRun(run, status, finishedAt, error);
}

function parseEpoch(value: string, fallback: number): number {
	const epoch = Date.parse(value);
	return Number.isFinite(epoch) ? epoch : fallback;
}

/**
 * The moment the server accepted the operation, taken from its own timestamps
 * and never from the client's submit time. Falls back to the worker start, then
 * to now, so a missing server field degrades to a client clock instead of
 * inverting one.
 */
export function operationStartEpoch(op: {
	createdAt?: string | null;
	startedAt?: string | null;
}): number {
	const accepted = op.createdAt ? Date.parse(op.createdAt) : Number.NaN;
	if (Number.isFinite(accepted)) return accepted;
	const started = op.startedAt ? Date.parse(op.startedAt) : Number.NaN;
	if (Number.isFinite(started)) return started;
	return Date.now();
}

/**
 * The operation's own settle time when the server recorded one, otherwise now.
 * A run rehydrated after the page was reopened must report the duration the
 * operation took, not the time since the browser was opened.
 */
export function operationSettleEpoch(op: {
	finishedAt?: string | null;
}): number {
	if (!op.finishedAt) return Date.now();
	return parseEpoch(op.finishedAt, Date.now());
}

/** True only while the run's request is genuinely in flight. */
export function isRunWorking(run: CodebaseRunState | null): boolean {
	return run?.status === "running";
}

/**
 * The real measured duration of a settled run, or null when the run never
 * settled. Never derived from a mount time or a simulated counter.
 */
export function runDurationSeconds(
	run: CodebaseRunState | null,
): number | null {
	if (!run || run.finishedAt === null) return null;
	return Math.max(0, (run.finishedAt - run.startedAt) / 1000);
}
