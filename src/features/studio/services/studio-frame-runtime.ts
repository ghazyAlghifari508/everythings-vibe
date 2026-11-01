import { STUDIO_FRAME_MAX_TOKENS } from "@/features/studio/types/studio-constants";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { ScrapeError } from "@/lib/design-errors";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import type { ValidatedFrameInput } from "../types/studio-service";
import {
	resolveStudioFrameSystemPrompt,
	resolveStudioSkillContext,
} from "./studio-design-skill-registry.server";
import type { StudioDesignSkillId } from "./studio-generation-options";
import { studioJobTiming } from "./studio-job-runtime";

// Started tasks are never cancelled by another task's failure.
export async function runWithConcurrency<T>(
	tasks: Array<() => Promise<T>>,
	limit: number,
): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.max(1, Math.min(limit, tasks.length)) },
		async () => {
			while (cursor < tasks.length) {
				const index = cursor++;
				const task = tasks[index];
				if (!task) continue;
				results[index] = await task();
			}
		},
	);
	const settled = await Promise.allSettled(workers);
	const failure = settled.find((result) => result.status === "rejected");
	if (failure?.status === "rejected") throw failure.reason;
	return results;
}

export function isRetryableProviderError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /429|rate.?limit|too many requests|timeout|timed out|econn|socket|temporar|unavailable|overloaded|try again/i.test(
		message,
	);
}

export type StudioStreamCompletion =
	| "COMPLETED"
	| "FAILED"
	| "INCOMPLETE_OUTPUT"
	| "FILTERED_OUTPUT"
	| "CANCELLED"
	| "PROVIDER_ERROR"
	| "UNKNOWN";

const INCOMPLETE_FINISH_REASONS = new Set([
	"length",
	"max_tokens",
	"max-tokens",
	"max_output_tokens",
	"max-output-tokens",
	"token_limit",
]);

const CANCELLED_FINISH_REASONS = new Set([
	"aborted",
	"abort",
	"cancel",
	"cancelled",
	"canceled",
]);

// Provider-side failures can arrive as a terminal reason instead of a thrown
// error (9router and OpenAI-compatible gateways vary). These are classified
// separately so a failed request never reads as a normal completion.
const PROVIDER_ERROR_FINISH_REASONS = new Set([
	"error",
	"failed",
	"failure",
	"timeout",
	"timed_out",
	"connection_error",
	"overloaded",
	"rate_limit",
	"rate_limited",
	"rate-limit",
	"unavailable",
]);

const NORMAL_FINISH_REASONS = new Set([
	"stop",
	"end_turn",
	"end-turn",
	"eos",
	"stop_sequence",
	"stop-sequence",
	"tool_calls",
	"tool-calls",
	"tool_call",
	"function_call",
]);

/**
 * Distinguishes a provider response that stopped before the document was
 * finished from a completed one, so a truncated or filtered stream is never
 * reported as a normal completion or a contract violation. Gateway finish
 * reasons are not standardized, so unknown provider-specific reasons are
 * surfaced as UNKNOWN rather than silently treated as success.
 */
export function classifyStudioStreamCompletion(
	finishReason: string | undefined,
	completed: boolean,
): StudioStreamCompletion {
	const reason = (finishReason ?? "").trim().toLowerCase();
	if (CANCELLED_FINISH_REASONS.has(reason)) return "CANCELLED";
	if (!completed) return "FAILED";
	if (INCOMPLETE_FINISH_REASONS.has(reason)) return "INCOMPLETE_OUTPUT";
	if (/content[-_ ]?filter|safety|blocked/.test(reason))
		return "FILTERED_OUTPUT";
	if (PROVIDER_ERROR_FINISH_REASONS.has(reason)) return "PROVIDER_ERROR";
	if (reason === "" || NORMAL_FINISH_REASONS.has(reason)) return "COMPLETED";
	return "UNKNOWN";
}

// A provider response that stopped early is a verified defect, not a design
// mistake. It carries the partial document so the bounded correction can
// repair it instead of discarding valid content.
export class StudioIncompleteOutputError extends Error {
	constructor(
		readonly completion: Extract<
			StudioStreamCompletion,
			"INCOMPLETE_OUTPUT" | "FILTERED_OUTPUT"
		>,
		readonly partialHtml: string,
	) {
		super(`Studio provider output ${completion}.`);
		this.name = "StudioIncompleteOutputError";
	}
}

export type StudioFrameGenerationStage = "frame" | "correction" | "revision";

export async function generateStudioHtml(
	prompt: string,
	maxTokens = STUDIO_FRAME_MAX_TOKENS,
	designSkillId: StudioDesignSkillId = "none",
	signal?: AbortSignal,
	timing?: ValidatedFrameInput["timing"],
	context: { stage?: StudioFrameGenerationStage; focus?: string[] } = {},
): Promise<string> {
	signal?.throwIfAborted();
	const startedAt = Date.now();
	const stage = context.stage ?? "frame";
	const system = resolveStudioFrameSystemPrompt(designSkillId, {
		stage,
		focus: context.focus,
	});
	if (timing) {
		const plan = resolveStudioSkillContext(designSkillId, {
			stage,
			focus: context.focus,
		}).plan;
		studioJobTiming("frame-context", startedAt, {
			...timing,
			skillId: designSkillId,
			skillStage: stage,
			skillChars: plan.characterCount,
			selectedSectionCount: plan.selectedSections.length,
			omittedSectionCount: plan.omittedSections.length,
			estimatedTokens: plan.estimatedTokens,
			systemChars: system.length,
			promptChars: prompt.length,
		});
	}
	const { generator, firstChunk, outcome } = await tryStreamWithFallback(
		selectModels(),
		[
			{
				role: "system",
				content: system,
			},
			{ role: "user", content: prompt },
		],
		signal,
		maxTokens,
	);
	if (timing) studioJobTiming("first-token", startedAt, timing);
	const outputStartedAt = Date.now();
	let raw = firstChunk;
	let completed = false;
	try {
		for await (const chunk of generator) raw += chunk;
		completed = true;
	} finally {
		if (timing)
			studioJobTiming("frame-output", outputStartedAt, {
				...timing,
				outputChars: raw.length,
				...outcome,
				// The applied ceiling travels with the usage so a gateway that
				// ignores or reinterprets maxOutputTokens is visible in the log.
				maxTokens,
				tokenLimitExceeded:
					outcome?.outputTokens !== undefined &&
					outcome.outputTokens > maxTokens,
				code: classifyStudioStreamCompletion(outcome?.finishReason, completed),
			});
	}
	signal?.throwIfAborted();
	const cleaned = extractCleanHtml(raw);
	if (cleaned.trim().length === 0)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"Studio gagal menghasilkan HTML.",
		);
	const completion = classifyStudioStreamCompletion(
		outcome?.finishReason,
		completed,
	);
	if (completion === "INCOMPLETE_OUTPUT" || completion === "FILTERED_OUTPUT")
		throw new StudioIncompleteOutputError(completion, cleaned);
	return cleaned;
}
