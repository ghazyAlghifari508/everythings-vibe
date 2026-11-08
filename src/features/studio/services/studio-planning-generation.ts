import { setTimeout as backoff } from "node:timers/promises";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import {
	STUDIO_GENERATION_TIMEOUT_MS,
	STUDIO_PLANNING_CORRECTION_MAX,
	STUDIO_PLANNING_MAX_TOKENS,
	STUDIO_PLANNING_REQUEST_MAX,
	STUDIO_PROVIDER_BACKOFF_MS,
} from "../types/studio-constants";
import type { StudioDesignMode } from "../types/studio-prompts";
import {
	StudioFrameError,
	studioFrameErrorCodeFor,
} from "./studio-frame-errors";
import {
	classifyStudioStreamCompletion,
	isRetryableProviderError,
} from "./studio-frame-runtime";
import { parseStudioPlanningWithBlueprint } from "./studio-planning-parser";
import { studioStreamMetrics } from "./studio-stream-metrics";
import { studioJobTiming } from "./studio-timing";

export async function generateStudioPlan(input: {
	systemPrompt: string;
	prompt: string;
	designMode: StudioDesignMode;
	count: number | null;
	requireVisualDirection: boolean;
	signal: AbortSignal;
	timing: { jobId: string; projectId: string };
}) {
	const signal = AbortSignal.any([
		input.signal,
		AbortSignal.timeout(STUDIO_GENERATION_TIMEOUT_MS),
	]);
	let correction: string | undefined;
	let corrections = 0;
	let lastFailure: unknown = new StudioFrameError("STUDIO_CONTRACT_VIOLATION");
	for (let request = 0; request < STUDIO_PLANNING_REQUEST_MAX; request++) {
		signal.throwIfAborted();
		const startedAt = Date.now();
		try {
			const { generator, firstChunk, outcome } = await tryStreamWithFallback(
				selectModels(),
				[
					{ role: "system", content: input.systemPrompt },
					{
						role: "user",
						content: correction
							? `${input.prompt}\nRepair the plan: ${correction}. Return only complete JSON matching the system schema.`
							: input.prompt,
					},
				],
				signal,
				STUDIO_PLANNING_MAX_TOKENS,
				undefined,
				undefined,
				{ maxAttempts: 1 },
			);
			studioJobTiming("planning-first-token", startedAt, {
				...input.timing,
				attempt: request + 1,
			});
			const outputStartedAt = Date.now();
			let raw = firstChunk;
			let completed = false;
			try {
				for await (const chunk of generator) raw += chunk;
				completed = true;
			} finally {
				studioJobTiming("planning-output", outputStartedAt, {
					...input.timing,
					attempt: request + 1,
					outputChars: raw.length,
					...studioStreamMetrics(
						outcome,
						STUDIO_PLANNING_MAX_TOKENS,
						classifyStudioStreamCompletion(outcome?.finishReason, completed),
					),
				});
			}
			signal.throwIfAborted();
			const completion = classifyStudioStreamCompletion(
				outcome?.finishReason,
				completed,
			);
			if (completion !== "COMPLETED" && completion !== "INCOMPLETE_OUTPUT")
				throw new StudioFrameError("STUDIO_PROVIDER_UNAVAILABLE");
			const parsed =
				completion === "INCOMPLETE_OUTPUT"
					? { ok: false as const, error: "INCOMPLETE_OUTPUT" }
					: parseStudioPlanningWithBlueprint(
							raw,
							input.designMode,
							input.count,
							input.requireVisualDirection,
						);
			studioJobTiming("planning-validation", startedAt, {
				...input.timing,
				attempt: request + 1,
				code: parsed.ok ? "VALID" : "INVALID_OUTPUT",
			});
			if (parsed.ok)
				return { screenPlan: parsed.plan, designBlueprint: parsed.blueprint };
			if (corrections >= STUDIO_PLANNING_CORRECTION_MAX)
				throw new StudioFrameError("STUDIO_CONTRACT_VIOLATION");
			corrections++;
			correction = parsed.error;
			lastFailure = new StudioFrameError("STUDIO_CONTRACT_VIOLATION");
		} catch (error) {
			signal.throwIfAborted();
			lastFailure = error;
			if (
				!isRetryableProviderError(error) ||
				request + 1 === STUDIO_PLANNING_REQUEST_MAX
			)
				throw error;
			studioJobTiming("planning-retry", startedAt, {
				...input.timing,
				attempt: request + 1,
				code: studioFrameErrorCodeFor(error),
			});
			await backoff(STUDIO_PROVIDER_BACKOFF_MS * 2 ** request, undefined, {
				signal,
			});
		}
	}
	throw lastFailure;
}
