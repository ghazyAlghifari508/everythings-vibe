export function studioJobTiming(
	stage: string,
	startedAt: number,
	context: {
		jobId?: string;
		projectId?: string;
		frameId?: string;
		attempt?: number;
		code?: string;
		detail?: string;
		issueCode?: string;
		issueCodes?: string[];
		issueStages?: string[];
		issueCount?: number;
		sourceContentNodes?: number;
		assembledContentNodes?: number;
		correctionRequired?: boolean;
		skillId?: string;
		skillChars?: number;
		promptChars?: number;
		systemChars?: number;
		outputChars?: number;
		inputTokens?: number;
		outputTokens?: number;
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
			durationMs: Date.now() - startedAt,
			...context,
		}),
	);
}
