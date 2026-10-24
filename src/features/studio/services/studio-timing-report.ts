import { z } from "zod";

const eventSchema = z.object({
	scope: z.literal("studio"),
	stage: z.string(),
	durationMs: z.number().finite().nonnegative(),
	jobId: z.string().optional(),
	frameId: z.string().optional(),
	attempt: z.number().optional(),
	code: z.string().optional(),
	skillId: z.string().optional(),
	skillChars: z.number().nonnegative().optional(),
	outputTokens: z.number().nonnegative().optional(),
	providerRetries: z.number().nonnegative().optional(),
	providerFallbacks: z.number().nonnegative().optional(),
});

function summarize(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
	// ponytail: twenty observations is a descriptive floor, not a confidence interval; use a larger controlled cohort for provider decisions.
	return {
		count: sorted.length,
		mean,
		p50:
			sorted.length >= 20 ? sorted[Math.ceil(sorted.length * 0.5) - 1] : null,
		p95:
			sorted.length >= 20 ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
	};
}

export function summarizeStudioTimings(log: string) {
	const events = log.split(/\r?\n/).flatMap((line) => {
		try {
			const parsed = eventSchema.safeParse(JSON.parse(line));
			return parsed.success ? [parsed.data] : [];
		} catch {
			return [];
		}
	});
	const buckets = new Map<string, number[]>();
	const firstReady = new Map<string, number>();
	const validated = new Set<string>();
	const corrected = new Set<string>();
	const tokens: number[] = [];
	const frameTokens = new Map<string, number>();
	const firstVisible = new Map<string, number>();
	const skills = new Map(
		events
			.filter(
				(event) =>
					event.stage === "frame-context" && event.frameId && event.skillId,
			)
			.map((event) => [event.frameId, event.skillId]),
	);
	const perSkill = new Map<
		string,
		{ latencies: number[]; guidance: Set<number> }
	>();
	let providerRetries = 0;
	let providerFallbacks = 0;
	for (const event of events) {
		const bucket = buckets.get(event.stage) ?? [];
		bucket.push(event.durationMs);
		buckets.set(event.stage, bucket);
		if (event.stage === "frame-ready" && event.jobId)
			firstReady.set(
				event.jobId,
				Math.min(firstReady.get(event.jobId) ?? Infinity, event.durationMs),
			);
		if (event.stage === "frame-visible" && event.jobId)
			firstVisible.set(
				event.jobId,
				Math.min(firstVisible.get(event.jobId) ?? Infinity, event.durationMs),
			);
		const skillId = event.skillId ?? skills.get(event.frameId);
		if (skillId) {
			const entry = perSkill.get(skillId) ?? {
				latencies: [],
				guidance: new Set<number>(),
			};
			if (event.stage === "frame-output")
				entry.latencies.push(event.durationMs);
			if (event.stage === "frame-context" && event.skillChars !== undefined)
				entry.guidance.add(event.skillChars);
			perSkill.set(skillId, entry);
		}
		if (
			event.stage === "frame-output" &&
			event.frameId &&
			event.outputTokens !== undefined
		)
			frameTokens.set(
				event.frameId,
				(frameTokens.get(event.frameId) ?? 0) + event.outputTokens,
			);
		if (event.stage === "validation" && event.frameId) {
			validated.add(event.frameId);
			if ((event.attempt ?? 1) > 1) corrected.add(event.frameId);
		}
		if (event.stage.endsWith("-output")) {
			if (event.outputTokens !== undefined) tokens.push(event.outputTokens);
			providerRetries += event.providerRetries ?? 0;
			providerFallbacks += event.providerFallbacks ?? 0;
		}
	}
	return {
		stages: Object.fromEntries(
			[...buckets].map(([stage, values]) => [stage, summarize(values)]),
		),
		firstReadyMs: [...firstReady.values()],
		firstVisibleMs: [...firstVisible.values()],
		perSkill: Object.fromEntries(
			[...perSkill].map(([id, entry]) => [
				id,
				{
					outputLatency: entry.latencies.length
						? summarize(entry.latencies)
						: null,
					guidanceChars: [...entry.guidance],
				},
			]),
		),
		meanMeasuredOutputTokensPerFrame: frameTokens.size
			? [...frameTokens.values()].reduce((sum, value) => sum + value, 0) /
				frameTokens.size
			: null,
		meanMeasuredOutputTokensPerRequest: tokens.length
			? tokens.reduce((sum, value) => sum + value, 0) / tokens.length
			: null,
		framesRequiringCorrectionPercent: validated.size
			? (corrected.size / validated.size) * 100
			: null,
		providerRetries,
		providerFallbacks,
		gatewayInternalFallbacks: null,
	};
}
