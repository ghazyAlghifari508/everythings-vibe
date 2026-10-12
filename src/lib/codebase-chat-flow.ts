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
): CodebaseRunState {
	return {
		stage,
		startedAt,
		finishedAt: null,
		status: "running",
		activity: CODEBASE_STAGE_ACTIVITY[stage],
		thinkingText: "",
		error: null,
	};
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
	if (input.hasTasks) return "handoff";
	if (input.hasAc) return "ac";
	if (input.hasPrd) return "prd";
	if (input.hasFeatureTree) return "feature";
	return "questions";
}

export type AskQuestionType = "select" | "text" | "multiselect";

/** Validated question shape from `/api/ask/options` (ask-service contract). */
export interface RawAskQuestion {
	id: string;
	question: string;
	type: AskQuestionType;
	options?: string[];
	recommended?: number;
	recommendationReason?: string;
}

export interface AdaptiveQuestionOption {
	id: string;
	label: string;
	recommended?: boolean;
}

export interface AdaptiveQuestion {
	id: string;
	title: string;
	type: AskQuestionType;
	options: AdaptiveQuestionOption[];
	recommendedOptionId?: string;
	recommendationReason?: string;
	customPlaceholder?: string;
}

/**
 * Map validated ask-service questions to the UI model. Question type semantics
 * are preserved, and a recommendation is only surfaced when the server parsed
 * an explicit in-range index; option order never implies a recommendation.
 */
export function mapAskQuestionsToAdaptive(
	raw: readonly RawAskQuestion[],
): AdaptiveQuestion[] {
	return raw.map((item) => {
		const options = (item.options ?? []).map((label, optionIndex) => ({
			id: `${item.id}-opt${optionIndex + 1}`,
			label,
			recommended: item.type === "select" && item.recommended === optionIndex,
		}));
		const recommendedOption =
			item.type === "select" && item.recommended !== undefined
				? options[item.recommended]
				: undefined;
		return {
			id: item.id,
			title: item.question,
			type: item.type,
			options,
			...(recommendedOption
				? {
						recommendedOptionId: recommendedOption.id,
						recommendationReason: item.recommendationReason,
					}
				: {}),
		};
	});
}

export function nextQuestionIndex(
	answers: Record<string, string>,
	questions: readonly FlowQuestion[],
): number {
	for (let index = 0; index < questions.length; index += 1) {
		const id = questions[index].id;
		if (!answers[id] || !answers[id].trim()) return index;
	}
	return -1;
}

export function areAllQuestionsAnswered(
	answers: Record<string, string>,
	questions: readonly FlowQuestion[],
): boolean {
	if (questions.length === 0) return false;
	return nextQuestionIndex(answers, questions) === -1;
}

export function buildFeatureMessage(
	featureName: string,
	answers: Record<string, string>,
): string {
	const joined = Object.values(answers)
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
		.join(" ");
	if (joined.length >= 3) return `Rencanakan fitur ${featureName}: ${joined}`;
	return `Rencanakan fitur ${featureName}`;
}

export interface ConfirmGenerateDeps {
	/** Persist the Ask handoff; resolves true only when the server confirmed. */
	saveHandoff: () => Promise<boolean>;
	generateFeature: () => Promise<{ status: number }>;
	/** Reload the authoritative feature tree; null when it is not persisted. */
	reloadFeatureTree: () => Promise<unknown | null>;
}

export type ConfirmGenerateOutcome =
	| { kind: "handoff_failed" }
	| { kind: "spec_failed" }
	| { kind: "generating" }
	| { kind: "not_persisted" }
	| { kind: "success" };

/**
 * Orchestrate Feature Specification generation with generation gated on real
 * persistence:
 *  - the Feature generator never runs when the Ask handoff was not saved;
 *  - a 200 response alone is not treated as success — the feature tree must be
 *    reloadable from the authoritative server state before the stage advances.
 */
export async function runConfirmGenerate(
	deps: ConfirmGenerateDeps,
): Promise<ConfirmGenerateOutcome> {
	const saved = await deps.saveHandoff();
	if (!saved) return { kind: "handoff_failed" };

	const response = await deps.generateFeature();
	if (response.status === 409) return { kind: "generating" };
	if (response.status < 200 || response.status >= 300)
		return { kind: "spec_failed" };

	const persisted = await deps.reloadFeatureTree();
	if (!persisted) return { kind: "not_persisted" };
	return { kind: "success" };
}

/** Persisted Ask question shape (mirrors the handoff state schema). */
export interface PersistedAskQuestion {
	id: string;
	question: string;
	type: AskQuestionType;
	options?: string[];
	recommended?: number;
	recommendationReason?: string;
}

/**
 * Serialize the visible adaptive questions into the restorable handoff shape so
 * a refresh or History reopen can rebuild the exact question list and answer
 * mapping. Only the fields a question actually carries are written.
 */
export function serializeAskQuestions(
	questions: readonly AdaptiveQuestion[],
): PersistedAskQuestion[] {
	return questions.map((question) => ({
		id: question.id,
		question: question.title,
		type: question.type,
		...(question.options.length > 0
			? { options: question.options.map((option) => option.label) }
			: {}),
		...(question.recommendedOptionId !== undefined
			? {
					recommended: question.options.findIndex(
						(option) => option.id === question.recommendedOptionId,
					),
				}
			: {}),
		...(question.recommendationReason
			? { recommendationReason: question.recommendationReason }
			: {}),
	}));
}

/**
 * Rebuild the UI questions and answers from a persisted handoff. Answers are
 * keyed by question id; option semantics (type, options, recommendation) are
 * reconstructed from the stored question fields so nothing is flattened.
 */
export function restoreAskState(
	questions: readonly PersistedAskQuestion[],
	answers: readonly { question: string; answer: string }[],
): { questions: AdaptiveQuestion[]; answers: Record<string, string> } {
	const restoredQuestions = mapAskQuestionsToAdaptive(
		questions.map((question) => ({
			id: question.id,
			question: question.question,
			type: question.type,
			...(question.options ? { options: question.options } : {}),
			...(question.recommended !== undefined
				? { recommended: question.recommended }
				: {}),
			...(question.recommendationReason
				? { recommendationReason: question.recommendationReason }
				: {}),
		})),
	);
	const answerByQuestionText = new Map(
		answers.map((entry) => [entry.question.trim(), entry.answer]),
	);
	const restoredAnswers: Record<string, string> = {};
	for (const question of restoredQuestions) {
		const answer = answerByQuestionText.get(question.title.trim());
		if (answer !== undefined && answer.trim().length > 0) {
			restoredAnswers[question.id] = answer;
		}
	}
	return { questions: restoredQuestions, answers: restoredAnswers };
}

/** Defensive parse of the `/api/ask/options` get-handoff payload. Malformed
 *  entries are dropped per field rather than thrown, so a partial handoff
 *  degrades gracefully instead of blocking recovery. */
export function parseRestoredQuestions(value: unknown): PersistedAskQuestion[] {
	if (!Array.isArray(value)) return [];
	const out: PersistedAskQuestion[] = [];
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null) continue;
		const record = entry as Record<string, unknown>;
		if (
			typeof record.id !== "string" ||
			typeof record.question !== "string" ||
			(record.type !== "select" &&
				record.type !== "text" &&
				record.type !== "multiselect")
		) {
			continue;
		}
		const options = Array.isArray(record.options)
			? record.options.filter(
					(option): option is string => typeof option === "string",
				)
			: undefined;
		const recommended =
			typeof record.recommended === "number" ? record.recommended : undefined;
		const recommendationReason =
			typeof record.recommendationReason === "string"
				? record.recommendationReason
				: undefined;
		out.push({
			id: record.id,
			question: record.question,
			type: record.type,
			...(options ? { options } : {}),
			...(recommended !== undefined ? { recommended } : {}),
			...(recommendationReason ? { recommendationReason } : {}),
		});
	}
	return out;
}

export function parseRestoredAnswers(
	value: unknown,
): Array<{ question: string; answer: string }> {
	if (!Array.isArray(value)) return [];
	const out: Array<{ question: string; answer: string }> = [];
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null) continue;
		const record = entry as Record<string, unknown>;
		if (
			typeof record.question === "string" &&
			typeof record.answer === "string" &&
			record.question.trim() &&
			record.answer.trim()
		) {
			out.push({ question: record.question, answer: record.answer });
		}
	}
	return out;
}
