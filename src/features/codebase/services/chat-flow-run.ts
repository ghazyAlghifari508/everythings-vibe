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
 * High-level operation summaries the client can only ever log after the server
 * confirmed them. There is deliberately no "reading files" or "analyzing
 * architecture" entry: neither endpoint reports those, so claiming them would
 * be invented progress.
 */
export const CODEBASE_RUN_ACTIVITY_LABEL = {
	"request.accepted": "Permintaan diterima server",
	"generation.started": "Model mulai menghasilkan respons",
	"result.persisted": "Hasil tersimpan di server",
} as const;

export type CodebaseRunActivityId = keyof typeof CODEBASE_RUN_ACTIVITY_LABEL;

export interface CodebaseRunActivity {
	id: CodebaseRunActivityId;
	/** When the client observed the event. Ordering only; never used to invent progress. */
	at: number;
}

/** The subset of a durable operation the activity log reads. */
export interface ObservedOperation {
	createdAt: string;
	startedAt?: string | null;
	status: string;
}

/**
 * What the workspace knows about one in-flight or finished AI request.
 *
 * Every field is a client-observable fact: when the request actually started,
 * when it actually settled, whether it succeeded, and the model's own streamed
 * reasoning when the endpoint streams one. There is deliberately no field for
 * "current phase" — the generators expose no phase events, so inventing one
 * here would be a fabricated progress indicator.
 */
export interface CodebaseRunState {
	stage: CodebaseRunStage;
	/**
	 * Identity of this exact request. Late events from an earlier request carry a
	 * stale id and can never overwrite a newer run's status or duration.
	 */
	requestId: string;
	/** Wall-clock start of the request, measured by the caller. */
	startedAt: number;
	/** Wall-clock settle time, null while the request is still in flight. */
	finishedAt: number | null;
	status: "running" | "done" | "failed";
	/** Active stage phase: "thinking" vs "generating" */
	phase?: "thinking" | "generating" | null;
	/** One honest description of what the request does. Never rotates. */
	activity: string;
	/** Backend events actually observed for this request, in the order observed. */
	activities: CodebaseRunActivity[];
	/** Real reasoning streamed by the model; empty when the endpoint is not streaming. */
	thinkingText: string;
	/** Server-reported failure message, null unless the run failed. */
	error: string | null;
}

/**
 * Honest per-stage activity lines. Each states the real request being made and
 * the real inputs it is grounded in — never an invented internal phase.
 */
export const CODEBASE_STAGE_ACTIVITY: Record<CodebaseRunStage, string> = {
	questions:
		"Menyusun pertanyaan klarifikasi dari prompt dan konteks repository.",
	feature: "Menyusun spesifikasi fitur dari jawaban dan konteks repository.",
	prd: "Menyusun PRD berdasarkan spesifikasi fitur dan konteks repository.",
	ac: "Menyusun Acceptance Criteria dari PRD dan konteks repository.",
	task: "Menyusun breakdown task dari PRD dan Acceptance Criteria.",
};

/** Short settled label per stage, shown once the request really succeeded. */
export const CODEBASE_STAGE_DONE_LABEL: Record<CodebaseRunStage, string> = {
	questions: "Pertanyaan siap",
	feature: "Spesifikasi fitur siap",
	prd: "PRD selesai",
	ac: "Acceptance Criteria selesai",
	task: "Task dan Kanban siap",
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
	initialPhase: "thinking" | "generating" = "thinking",
	activities: readonly CodebaseRunActivity[] = [],
): CodebaseRunState {
	return {
		stage,
		requestId: nextRequestId(startedAt),
		startedAt,
		finishedAt: null,
		status: "running",
		phase: initialPhase,
		activity: CODEBASE_STAGE_ACTIVITY[stage],
		activities: [...activities],
		thinkingText: "",
		error: null,
	};
}

/**
 * Update the observable generation phase ("thinking" vs "generating") when a real
 * backend signal arrives (e.g. onDelta stream chunks).
 */
export function setRunPhase(
	run: CodebaseRunState | null,
	phase: "thinking" | "generating",
	requestId?: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running" || !ownedBy(run, requestId)) return run;
	if (run.phase === phase) return run;
	return { ...run, phase };
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

/**
 * Append one confirmed backend event. Duplicate ids collapse, and a settled run
 * is never reopened by a late event.
 */
export function recordRunActivity(
	run: CodebaseRunState | null,
	id: CodebaseRunActivityId,
	at: number,
	requestId?: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running" || !ownedBy(run, requestId)) return run;
	if (run.activities.some((activity) => activity.id === id)) return run;
	return { ...run, activities: [...run.activities, { id, at }] };
}

function parseEpoch(value: string, fallback: number): number {
	const epoch = Date.parse(value);
	return Number.isFinite(epoch) ? epoch : fallback;
}

/**
 * Log the events a durable operation has already confirmed. Hydration uses the
 * same function, so a remount replays real persisted facts rather than a
 * reconstructed narrative.
 */
export function recordOperationActivities(
	run: CodebaseRunState | null,
	op: ObservedOperation,
	requestId?: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running" || !ownedBy(run, requestId)) return run;
	let next = recordRunActivity(
		run,
		"request.accepted",
		parseEpoch(op.createdAt, Date.now()),
		requestId,
	);
	if (op.startedAt && op.status !== "queued") {
		next = recordRunActivity(
			next,
			"generation.started",
			parseEpoch(op.startedAt, Date.now()),
			requestId,
		);
	}
	return next;
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

/**
 * Events a persisted operation already proves. Only facts the server stored are
 * replayed; no phase the client never observed is reconstructed.
 */
export function activitiesFromOperation(
	op: ObservedOperation,
): CodebaseRunActivity[] {
	const activities: CodebaseRunActivity[] = [];
	const createdAt = Date.parse(op.createdAt);
	if (Number.isFinite(createdAt)) {
		activities.push({ id: "request.accepted", at: createdAt });
	}
	if (op.startedAt) {
		const startedAt = Date.parse(op.startedAt);
		if (Number.isFinite(startedAt)) {
			activities.push({ id: "generation.started", at: startedAt });
		}
	}
	return activities;
}

/**
 * Append streamed reasoning to the run. `thinking_reset` clears it first so a
 * provider retry replaces stale reasoning instead of concatenating onto it.
 */
export function appendRunThinking(
	run: CodebaseRunState | null,
	chunk: string,
	requestId?: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running" || !ownedBy(run, requestId)) return run;
	return { ...run, thinkingText: run.thinkingText + chunk };
}

export function resetRunThinking(
	run: CodebaseRunState | null,
	requestId?: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running" || !ownedBy(run, requestId)) return run;
	return { ...run, thinkingText: "" };
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
