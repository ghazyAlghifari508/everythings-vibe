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
		outputChars?: number;
		inputTokens?: number;
		outputTokens?: number;
		maxTokens?: number;
		tokenLimitExceeded?: boolean;
		providerRetries?: number;
		providerFallbacks?: number;
		referenceChars?: number;
		prdChars?: number;
	},
) {
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
