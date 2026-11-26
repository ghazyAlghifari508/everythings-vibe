import type { StreamOutcome } from "@/lib/ai-client";

export function studioStreamMetrics(
	outcome: StreamOutcome | undefined,
	requestedMaxTokens: number,
	completion: string,
) {
	const outputTokens = outcome?.outputTokens;
	return {
		finishReason: outcome?.finishReason,
		rawFinishReason: outcome?.rawFinishReason,
		inputTokens: outcome?.inputTokens,
		outputTokens,
		textTokens: outcome?.textTokens,
		reasoningTokens: outcome?.reasoningTokens,
		providerRetries: outcome?.providerRetries,
		providerFallbacks: outcome?.providerFallbacks,
		requestedMaxTokens,
		// The combo gateway does not expose the upstream model's effective cap.
		effectiveMaxTokens: null,
		accountingAboveRequested:
			outputTokens === undefined ? null : outputTokens > requestedMaxTokens,
		ceilingReached: completion === "INCOMPLETE_OUTPUT",
		code: completion,
	};
}
