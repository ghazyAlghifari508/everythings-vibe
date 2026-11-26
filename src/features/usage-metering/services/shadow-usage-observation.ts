import { SHADOW_OBSERVATION_MAX_KEYS } from "@/lib/constants";
import { COMBO_MODEL_ID } from "@/lib/model-config";
import type {
	ProviderObservation,
	ShadowObservation,
	ShadowProviderUsage,
} from "../types/shadow-usage";
import { shadowProviderUsageSchema } from "../types/shadow-usage";

interface ObservationState {
	providerSeen: boolean;
	provider: ShadowProviderUsage;
	timings: Record<string, number>;
}

const observations = new Map<string, ObservationState>();

function emptyProviderUsage(): ShadowProviderUsage {
	return {
		provider: "9router",
		model: COMBO_MODEL_ID,
		inputTokens: null,
		outputTokens: null,
		cachedTokens: null,
		textTokens: null,
		reasoningTokens: null,
		providerRetries: null,
		providerFallbacks: null,
		finishReason: null,
	};
}

function stateFor(key: string): ObservationState {
	const existing = observations.get(key);
	if (existing) return existing;
	// A crashed worker can leave a key behind. Bound the map so a long-lived
	// process never accumulates unbounded telemetry state.
	if (observations.size >= SHADOW_OBSERVATION_MAX_KEYS) {
		const oldest = observations.keys().next();
		if (!oldest.done) observations.delete(oldest.value);
	}
	const created: ObservationState = {
		providerSeen: false,
		provider: emptyProviderUsage(),
		timings: {},
	};
	observations.set(key, created);
	return created;
}

function addCount(
	current: number | null,
	next: number | undefined,
): number | null {
	if (next === undefined) return current;
	return (current ?? 0) + next;
}

/**
 * Called from existing telemetry call sites (studio timing, scrape timing
 * handlers). Aggregates only numeric provider facts for one logical job.
 */
export function observeProviderUsage(
	logicalJobId: string,
	usage: ProviderObservation,
): void {
	const state = stateFor(logicalJobId);
	state.providerSeen = true;
	const provider = state.provider;
	state.provider = {
		provider: usage.provider ?? provider.provider,
		model: usage.model ?? provider.model,
		inputTokens: addCount(provider.inputTokens, usage.inputTokens),
		outputTokens: addCount(provider.outputTokens, usage.outputTokens),
		cachedTokens: addCount(provider.cachedTokens, usage.cachedTokens),
		textTokens: addCount(provider.textTokens, usage.textTokens),
		reasoningTokens: addCount(provider.reasoningTokens, usage.reasoningTokens),
		providerRetries: addCount(provider.providerRetries, usage.providerRetries),
		providerFallbacks: addCount(
			provider.providerFallbacks,
			usage.providerFallbacks,
		),
		finishReason: usage.finishReason ?? provider.finishReason,
	};
}

/** Accumulates labeled durations from an existing instrumentation handler. */
export function observeTiming(
	logicalJobId: string,
	label: string,
	durationMs: number,
): void {
	const state = stateFor(logicalJobId);
	state.timings[label] = (state.timings[label] ?? 0) + durationMs;
}

/** Drains one operation's observations. A second read returns null. */
export function takeObservation(
	logicalJobId: string,
): ShadowObservation | null {
	const state = observations.get(logicalJobId);
	if (!state) return null;
	observations.delete(logicalJobId);
	return {
		providerUsage: state.providerSeen
			? shadowProviderUsageSchema.parse(state.provider)
			: null,
		timings: { ...state.timings },
	};
}
