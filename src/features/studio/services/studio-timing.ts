import { observeProviderUsage } from "@/features/usage-metering/services/shadow-usage-observation";
import { COMBO_MODEL_ID } from "@/lib/model-config";
export function studioJobTiming(
	stage: string,
	startedAt: number,
	context: {
		jobId?: string;
		projectId?: string;
		frameId?: string;
		attempt?: number;
		code?: string;
		category?: string;
		detail?: string;
		issueCode?: string;
		issueCodes?: string[];
		issueStages?: string[];
		issueCount?: number;
		hardCount?: number;
		repairableCount?: number;
		advisoryCount?: number;
		sourceContentNodes?: number;
		assembledContentNodes?: number;
		correctionRequired?: boolean;
		promptChars?: number;
		systemChars?: number;
		outputChars?: number;
		inputTokens?: number;
		outputTokens?: number;
		textTokens?: number;
		reasoningTokens?: number;
		finishReason?: string;
		rawFinishReason?: string;
		requestedMaxTokens?: number;
		effectiveMaxTokens?: number | null;
		accountingAboveRequested?: boolean | null;
		ceilingReached?: boolean;
		documentChars?: number;
		repairCount?: number;
		provider?: string;
		providerRetries?: number;
		providerFallbacks?: number;
		cachedTokens?: number;
		referenceChars?: number;
		prdChars?: number;
	},
) {
	// Reuse the existing provider-usage signal already carried by frame-output
	// and planning-output events. No new telemetry stack, no prompt content.
	if (
		context.jobId &&
		(context.inputTokens !== undefined ||
			context.outputTokens !== undefined ||
			context.providerRetries !== undefined ||
			context.providerFallbacks !== undefined)
	) {
		observeProviderUsage(context.jobId, {
			provider: "9router",
			model: COMBO_MODEL_ID,
			inputTokens: context.inputTokens,
			outputTokens: context.outputTokens,
			textTokens: context.textTokens,
			cachedTokens: context.cachedTokens,
			reasoningTokens: context.reasoningTokens,
			providerRetries: context.providerRetries,
			providerFallbacks: context.providerFallbacks,
			finishReason: context.finishReason,
		});
	}
	const { detail: _privateDetail, ...safeContext } = context;
	console.info(
		JSON.stringify({
			scope: "studio",
			stage,
			timestamp: new Date().toISOString(),
			durationMs: Date.now() - startedAt,
			...safeContext,
		}),
	);
}
