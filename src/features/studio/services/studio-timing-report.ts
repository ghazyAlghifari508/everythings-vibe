import { z } from "zod";

const eventSchema = z.object({
	scope: z.literal("studio"),
	stage: z.string(),
	durationMs: z.number().finite().nonnegative(),
	jobId: z.string().optional(),
	frameId: z.string().optional(),
	attempt: z.number().optional(),
	code: z.string().optional(),
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
		firstVisibleMs: buckets.get("frame-visible") ?? [],
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
