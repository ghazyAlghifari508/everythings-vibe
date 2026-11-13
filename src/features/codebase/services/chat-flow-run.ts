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
 * Observable status of one run.
 *
 * `queued` means the durable operation was accepted but no worker attempt has
 * started yet: the job is waiting for a worker, so nothing is executing and the
 * UI must not claim the AI is thinking. `running` means one attempt is actually
 * executing and only that attempt's clock is displayed.
 */
export type CodebaseRunStatus = "queued" | "running" | "done" | "failed";

/**
 * What the workspace knows about one in-flight or finished AI request.
 *
 * Every field is a client-observable fact: which durable operation and attempt
 * this run observes, when that attempt started, when it settled, whether it
 * succeeded, and the server's own failure message. There is deliberately no
 * phase, activity log or reasoning field: the generators stream nothing but
 * durable-operation status, so any "stage" the UI could invent here would be
 * fabricated progress.
 */
export interface CodebaseRunState {
	stage: CodebaseRunStage;
	/**
	 * Identity of this exact request. Late events from an earlier request carry a
	 * stale id and can never overwrite a newer run's status or duration.
	 */
	requestId: string;
	/**
	 * Durable operation this run observes. `null` only for client-local runs
	 * (revisions) that never had a durable operation. A run never adopts a second
	 * operation: another operation's status cannot touch this run.
	 */
	operationId: string | null;
	/**
	 * Server attempt counter of the observed operation, `0` while it has not been
	 * claimed. Together with `operationId` this is the attempt identity a late
	 * callback must match before it may settle the run.
	 */
	attempt: number;
	/**
	 * Start of the current attempt, taken from the server's own attempt window.
	 * `null` while the operation is still queued: a retry never inherits the
	 * duration of the attempt before it.
	 */
	startedAt: number | null;
	/** Wall-clock settle time of the current attempt, null while it is in flight. */
	finishedAt: number | null;
	status: CodebaseRunStatus;
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

/**
 * The only operation fields a run reads. Kept structural so both the durable
 * operation DTO and an ad-hoc server response are accepted without a cast.
 */
export interface ObservedOperation {
	id: string;
	stage: CodebaseRunStage;
	status: "queued" | "running" | "completed" | "failed" | "cancelled";
	attempt?: number | null;
	createdAt?: string | null;
	startedAt?: string | null;
	finishedAt?: string | null;
	error?: string | null;
}

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
 * A run whose attempt is executing on the server. Named for that fact: a queued
 * operation is accepted work, not running work.
 */
export function startRun(
	stage: CodebaseRunStage,
	startedAt: number,
): CodebaseRunState {
	return {
		stage,
		requestId: nextRequestId(startedAt),
		operationId: null,
		attempt: 0,
		startedAt,
		finishedAt: null,
		status: "running",
		error: null,
	};
}

/**
 * A run whose operation is accepted but not yet claimed by a worker. It carries
 * no start time at all: the attempt clock begins only when an attempt does.
 */
export function queueRun(stage: CodebaseRunStage): CodebaseRunState {
	return {
		stage,
		requestId: nextRequestId(0),
		operationId: null,
		attempt: 0,
		startedAt: null,
		finishedAt: null,
		status: "queued",
		error: null,
	};
}

/**
 * The start of the operation's CURRENT attempt, from the server's own attempt
 * window and never from a client submit time.
 *
 * - `queued`: no attempt exists yet, so there is no clock (`null`).
 * - otherwise: the attempt's own `startedAt`. Rows written before attempt
 *   timestamps existed fall back to their creation time, which is the only
 *   recorded acceptance they have.
 */
export function attemptStartEpoch(op: {
	status?: string;
	createdAt?: string | null;
	startedAt?: string | null;
}): number | null {
	if (op.status === "queued") return null;
	const started = op.startedAt ? Date.parse(op.startedAt) : Number.NaN;
	if (Number.isFinite(started)) return started;
	const accepted = op.createdAt ? Date.parse(op.createdAt) : Number.NaN;
	return Number.isFinite(accepted) ? accepted : null;
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
	const epoch = Date.parse(op.finishedAt);
	return Number.isFinite(epoch) ? epoch : Date.now();
}

/**
 * Adopt an operation snapshot into the run that observes it.
 *
 * Ignored for a settled run (a late snapshot never revives or rewrites an
 * outcome), for a snapshot of another operation, and for an older attempt of
 * the same operation. `queued` clears the attempt clock; `running` anchors it
 * on the new attempt's own start, which is exactly what makes a retry start at
 * `00.0s` instead of continuing the previous attempt's duration.
 */
export function observeOperation(
	run: CodebaseRunState | null,
	op: ObservedOperation,
): CodebaseRunState | null {
	if (!run) return run;
	if (run.status === "done" || run.status === "failed") return run;
	if (run.stage !== op.stage) return run;
	if (run.operationId !== null && run.operationId !== op.id) return run;
	const attempt = op.attempt ?? run.attempt;
	if (attempt < run.attempt) return run;
	if (op.status === "queued")
		return {
			...run,
			operationId: op.id,
			attempt,
			status: "queued",
			startedAt: null,
			finishedAt: null,
		};
	if (op.status === "running")
		return {
			...run,
			operationId: op.id,
			attempt,
			status: "running",
			startedAt: attemptStartEpoch(op) ?? Date.now(),
			finishedAt: null,
		};
	// Terminal snapshots settle through `settleRun*`, which records the outcome.
	return run;
}

/**
 * Rebuild the run window the server recorded for an operation. A queued
 * operation yields a queued run; every other status yields an active-shaped run
 * carrying that attempt's real window, which the caller settles immediately with
 * `operationSettleEpoch` (used to rehydrate after a remount or a reconnect).
 */
export function runFromOperation(op: ObservedOperation): CodebaseRunState {
	if (op.status === "queued") {
		const queued = queueRun(op.stage);
		return { ...queued, operationId: op.id };
	}
	return {
		...startRun(op.stage, attemptStartEpoch(op) ?? Date.now()),
		operationId: op.id,
		attempt: op.attempt ?? 0,
	};
}

/**
 * Settle a run. A run that already settled is returned unchanged so a late
 * callback cannot rewrite the recorded outcome or the recorded duration. A
 * queued run settles too: the operation can complete without the client ever
 * observing its attempt (adopted or reconciled artifact).
 */
export function settleRun(
	run: CodebaseRunState | null,
	status: "done" | "failed",
	finishedAt: number,
	error?: string,
): CodebaseRunState | null {
	if (!run || (run.status !== "running" && run.status !== "queued")) return run;
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

/**
 * Settle the run with the outcome of one specific operation, refusing callbacks
 * that do not belong to it:
 *
 * - a settled run keeps its recorded outcome;
 * - another stage or another operation cannot settle this run;
 * - an attempt OLDER than the one this run observes cannot settle it, so a
 *   stale worker callback can never overwrite a newer attempt's status;
 * - when `requestId` is given, only that request may settle the run.
 */
export function settleRunForOperation(
	run: CodebaseRunState | null,
	op: ObservedOperation,
	status: "done" | "failed",
	finishedAt: number,
	error?: string,
	requestId?: string,
): CodebaseRunState | null {
	if (!run) return run;
	if (requestId !== undefined && run.requestId !== requestId) return run;
	if (run.status !== "running" && run.status !== "queued") return run;
	if (run.stage !== op.stage) return run;
	if (run.operationId !== null && run.operationId !== op.id) return run;
	if ((op.attempt ?? run.attempt) < run.attempt) return run;
	return settleRun(run, status, finishedAt, error);
}

/** True while the run holds an accepted operation whose outcome is unknown. */
export function isRunActive(run: CodebaseRunState | null): boolean {
	return run?.status === "queued" || run?.status === "running";
}

/** True only while an attempt is genuinely executing on the server. */
export function isRunWorking(run: CodebaseRunState | null): boolean {
	return run?.status === "running";
}

/**
 * The real measured duration of the current attempt, or null when the attempt
 * has no recorded start (queued) or never settled. Never derived from a mount
 * time or a simulated counter.
 */
export function runDurationSeconds(
	run: CodebaseRunState | null,
): number | null {
	if (!run || run.finishedAt === null || run.startedAt === null) return null;
	return Math.max(0, (run.finishedAt - run.startedAt) / 1000);
}
