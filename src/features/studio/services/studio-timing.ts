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
		sourceContentNodes?: number;
		assembledContentNodes?: number;
		correctionRequired?: boolean;
		skillId?: string;
		skillStage?: string;
		skillChars?: number;
		selectedSectionCount?: number;
		omittedSectionCount?: number;
		estimatedTokens?: number;
		promptChars?: number;
		systemChars?: number;
		promptAssemblyMs?: number;
		outputChars?: number;
		inputTokens?: number;
		outputTokens?: number;
		textTokens?: number;
		reasoningTokens?: number;
		maxTokens?: number;
		tokenLimitExceeded?: boolean;
		providerRetries?: number;
		providerFallbacks?: number;
		finishReason?: string;
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
	console.info(
		JSON.stringify({
			scope: "studio",
			stage,
			timestamp: new Date().toISOString(),
			durationMs: Date.now() - startedAt,
			...context,
		}),
	);
}
