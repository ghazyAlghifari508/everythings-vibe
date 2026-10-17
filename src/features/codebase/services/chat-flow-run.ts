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
 * Every field is a client-observable fact: when the request actually started,
 * when it actually settled, whether it succeeded, and the model's own streamed
 * reasoning when the endpoint streams one. There is deliberately no field for
 * "current phase" — the generators expose no phase events, so inventing one
 * here would be a fabricated progress indicator.
 */
export interface CodebaseRunState {
	stage: CodebaseRunStage;
	/** Wall-clock start of the request, measured by the caller. */
	startedAt: number;
	/** Wall-clock settle time, null while the request is still in flight. */
	finishedAt: number | null;
	status: "running" | "done" | "failed";
	/** Active stage phase: "thinking" vs "generating" */
	phase?: "thinking" | "generating" | null;
	/** One honest description of what the request does. Never rotates. */
	activity: string;
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

export function startRun(
	stage: CodebaseRunStage,
	startedAt: number,
	initialPhase: "thinking" | "generating" = "thinking",
): CodebaseRunState {
	return {
		stage,
		startedAt,
		finishedAt: null,
		status: "running",
		phase: initialPhase,
		activity: CODEBASE_STAGE_ACTIVITY[stage],
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
): CodebaseRunState | null {
	if (!run || run.status !== "running") return run;
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
 * Append streamed reasoning to the run. `thinking_reset` clears it first so a
 * provider retry replaces stale reasoning instead of concatenating onto it.
 */
export function appendRunThinking(
	run: CodebaseRunState | null,
	chunk: string,
): CodebaseRunState | null {
	if (!run || run.status !== "running") return run;
	return { ...run, thinkingText: run.thinkingText + chunk };
}

export function resetRunThinking(
	run: CodebaseRunState | null,
): CodebaseRunState | null {
	if (!run || run.status !== "running") return run;
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
