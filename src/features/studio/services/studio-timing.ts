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
		finishReason?: string;
		rawFinishReason?: string;
		requestedMaxTokens?: number;
		effectiveMaxTokens?: number | null;
		accountingAboveRequested?: boolean | null;
		ceilingReached?: boolean;
		documentChars?: number;
		repairCount?: number;
		providerRetries?: number;
		providerFallbacks?: number;
		referenceChars?: number;
		prdChars?: number;
	},
) {
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
